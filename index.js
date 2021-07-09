"use strict";

var inherits = require("util").inherits;
var Service, Characteristic, HomebridgeAPI;

// OccupancyTriggerSwitch is 100% based on https://github.com/nfarina/homebridge-dummy

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  HomebridgeAPI = homebridge;

  /**
   * Characteristic "Time Remaining"
   */
  Characteristic.TimeRemaining = function () {
    Characteristic.call(
      this,
      "Time Remaining",
      "2000006D-0000-1000-8000-0026BB765291"
    );
    this.setProps({
      format: Characteristic.Formats.UINT64,
      unit: Characteristic.Units.SECONDS,
      maxValue: 3600,
      minValue: 0,
      minStep: 1,
      perms: [
        Characteristic.Perms.READ,
        Characteristic.Perms.WRITE,
        Characteristic.Perms.NOTIFY,
      ],
    });
    this.value = this.getDefaultValue();
  };
  inherits(Characteristic.TimeRemaining, Characteristic);
  Characteristic.TimeRemaining.UUID = "2000006D-0000-1000-8000-0026BB765291";

  /**
   * Characteristic "Timeout Delay"
   */
  Characteristic.TimeoutDelay = function () {
    Characteristic.call(
      this,
      "Post-Activity Timeout Delay",
      "2100006D-0000-1000-8000-0026BB765291"
    );
    this.setProps({
      format: Characteristic.Formats.UINT64,
      unit: Characteristic.Units.SECONDS,
      maxValue: 3600,
      minValue: 0,
      minStep: 1,
      perms: [
        Characteristic.Perms.READ,
        Characteristic.Perms.WRITE,
        Characteristic.Perms.NOTIFY,
      ],
    });
    this.value = this.getDefaultValue();
  };
  inherits(Characteristic.TimeoutDelay, Characteristic);
  Characteristic.TimeoutDelay.UUID = "2100006D-0000-1000-8000-0026BB765291";

  // Register
  homebridge.registerAccessory(
    "homebridge-magic-occupancy",
    "MagicOccupancy",
    MagicOccupancy
  );
};

class MagicOccupancy {
  constructor(log, config) {
    this.log = log;
    this.name = config.name || "MagicOccupancy";
    this.statefulSwitchesCount = Math.max(0, config.statefulSwitchesCount || 0);
    this.triggerSwitchesCount = Math.max(0, config.triggerSwitchesCount || 0);
    this.motionSwitchesCount = Math.max(0, config.motionSwitchesCount || 0);
    this.statefulStayOnSwitchesCount = Math.max(0, config.statefulStayOnSwitchesCount || 0);
    this.triggerStayOnSwitchesCount = Math.max(0, config.triggerStayOnSwitchesCount || 0);
    this.motionStayOnSwitchesCount = Math.max(0, config.motionStayOnSwitchesCount || 0);
    this.stayOccupiedDelay = Math.min(3600, Math.max(0, parseInt(config.stayOccupiedDelay || 0, 10) || 0));
    this.maxOccupationTimeout = Math.max(0, parseInt(config.maxOccupationTimeout || 0, 10) || 0)
    this.ignoreStatefulIfTurnedOnByTrigger = (config.ignoreStatefulIfTurnedOnByTrigger == true);
    this.startOnReboot = config.startOnReboot || false;
    this.wasTurnedOnByTriggerSwitch = false;
    this.initializationCompleted = false;
    this.locksCounter = 0;
    this.isPendingCheckOccupancy = false;

    this._max_occupation_timer = null;

    this._timer = null;
    this._timer_started = null;
    this._timer_delay = 0;
    this._interval = null;
    this._interval_last_value = 0;
    this._last_occupied_state = false;

    this.switchServices = [];
    this.stayOnServices = [];
    this.occupancyService = new Service.OccupancySensor(this.name);
    this.informationService = new Service.AccessoryInformation()
      .setCharacteristic(Characteristic.Manufacturer, "https://github.com/Jason-Morcos/homebridge-magic-occupancy")
      .setCharacteristic(Characteristic.Model, "2")
      .setCharacteristic(Characteristic.SerialNumber, "JmoMagicOccupancySwitch");
    this.masterShutoffService = null;

    this.occupancyService.addCharacteristic(Characteristic.TimeoutDelay);
    this.occupancyService.setCharacteristic(
      Characteristic.TimeoutDelay,
      this.stayOccupiedDelay
    );
    this.occupancyService
      .getCharacteristic(Characteristic.TimeoutDelay)
      .on("change", (event) => {
        this.log("Setting stay occupied delay to:", event.newValue);
        this.stayOccupiedDelay = event.newValue;
      });

    this.occupancyService.addCharacteristic(Characteristic.TimeRemaining);
    this.occupancyService.setCharacteristic(Characteristic.TimeRemaining, 0);

    this.occupancyService
      .getCharacteristic(Characteristic.TimeRemaining)
      .on("change", (event) => {
        if (event.newValue === 0 && event.oldValue > 0) {
          this.log('Cancel timer and set occupancy to "NotDetected"');
          this.setOccupancyNotDetected();
        }
      });

    this.cacheDirectory = HomebridgeAPI.user.persistPath();
    this.storage = require("node-persist");
    this.storage.initSync({
      dir: this.cacheDirectory,
      forgiveParseErrors: true,
    });

    /* Make the statefulSwitches */
    if(this.statefulSwitchesCount > 0) {
      this.log.debug("Making " + this.statefulSwitchesCount + " Stateful trigger switchServices");
      for (let i = 0, c = this.statefulSwitchesCount; i < c; i += 1) {
        this.switchServices.push((new OccupancyTriggerSwitch(this, {
            name: "Main Stateful " + i.toString(),
            stayOnOnly: false,
            isTrigger: false,
            isMotion: false,
        }))._service);
      }
    }
    /* Make the triggerSwitches */
    if(this.triggerSwitchesCount > 0) {
      this.log.debug("Making " + this.triggerSwitchesCount + " Trigger trigger switchServices");
      for (let i = 0, c = this.triggerSwitchesCount; i < c; i += 1) {
        this.switchServices.push((new OccupancyTriggerSwitch(this, {
            name: "Main Trigger " + i.toString(),
            stayOnOnly: false,
            isTrigger: true,
            isMotion: false,
        }))._service);
      }
    }
    /* Make the motionSwitches */
    if(this.motionSwitchesCount > 0) {
      this.log.debug("Making " + this.motionSwitchesCount + " Motion trigger switchServices");
      for (let i = 0, c = this.motionSwitchesCount; i < c; i += 1) {
        this.switchServices.push((new OccupancyTriggerSwitch(this, {
            name: "Main Motion " + i.toString(),
            stayOnOnly: false,
            isTrigger: true,
            isMotion: true,
        }))._service);
      }
    }

    /* Make the statefulStayOnSwitches */
    if(this.statefulStayOnSwitchesCount > 0) {
      this.log.debug("Making " + this.statefulStayOnSwitchesCount + " StayOn Stateful trigger switchServices");
      for (let i = 0, c = this.statefulStayOnSwitchesCount; i < c; i += 1) {
        this.stayOnServices.push((new OccupancyTriggerSwitch(this, {
            name: "StayOn Stateful " + i.toString(),
            stayOnOnly: true,
            isTrigger: false,
            isMotion: false,
        }))._service);
      }
    }
    /* Make the triggerStayOnSwitches */
    if(this.triggerStayOnSwitchesCount > 0) {
      this.log.debug("Making " + this.triggerStayOnSwitchesCount + " StayOn Trigger trigger switchServices");
      for (let i = 0, c = this.triggerStayOnSwitchesCount; i < c; i += 1) {
        this.stayOnServices.push((new OccupancyTriggerSwitch(this, {
            name: "StayOn Trigger " + i.toString(),
            stayOnOnly: true,
            isTrigger: true,
            isMotion: false,
        }))._service);
      }
    }
    /* Make the motionStayOnSwitches */
    if(this.motionStayOnSwitchesCount > 0) {
      this.log.debug("Making " + this.motionStayOnSwitchesCount + " StayOn Motion trigger switchServices");
      for (let i = 0, c = this.motionStayOnSwitchesCount; i < c; i += 1) {
        this.stayOnServices.push((new OccupancyTriggerSwitch(this, {
            name: "StayOn Motion " + i.toString(),
            stayOnOnly: true,
            isTrigger: true,
            isMotion: true,
        }))._service);
      }
    }

    //Create master shutoff
    if(config.createMasterShutoff == true) {
      this.masterShutoffService = (new MasterShutoffSwitch(this))._service;
    }

    //Handle start on reboot
    if(this.startOnReboot) {
      this.log(
        `startOnReboot==true - setting to active`
      );
      setOccupancyDetected();
    }

    //We're up!
    this.initializationCompleted = true;
    this.checkOccupancy(10);
  }

  /**
   * startUnoccupiedDelays the countdown timer.
   */
  startUnoccupiedDelay() {
    this.locksCounter += 1;
    if(this._last_occupied_state === false) {
      this.setOccupancyNotDetected();
      return;
    }

    this.stop();
    this._timer_started = new Date().getTime();
    this.log("Timer startUnoccupiedDelayed:", this.stayOccupiedDelay);
    if (this.stayOccupiedDelay > 0) {
      this._timer = setTimeout(
        this.setOccupancyNotDetected.bind(this),
        Math.round(this.stayOccupiedDelay * 1000)
      );
      this._timer_delay = this.stayOccupiedDelay;
      this._interval = setInterval(() => {
        var elapsed = (new Date().getTime() - this._timer_started) / 1000,
          newValue = Math.round(this._timer_delay - elapsed);

        if (newValue !== this._interval_last_value) {
          this.occupancyService.setCharacteristic(
            Characteristic.TimeRemaining,
            newValue
          );
          this._interval_last_value = newValue;
        }
      }, 250);
    } else {
      /* occupancy no longer detected */
      this.setOccupancyNotDetected();
    }
    this.locksCounter -= 1;
  }

  /**
   * Stops the countdown timer
   */
  stop() {
    if (this._timer) {
      this.log("Delay timer stopped");
      clearTimeout(this._timer);
      clearInterval(this._interval);
      this._timer = null;
      this._timer_started = null;
      this._timer_delay = null;
      this._interval = null;
    }
  }

  setOccupancyDetected() {
    this.locksCounter += 1;
    this.stop();
    this._last_occupied_state = true;
    this.occupancyService.setCharacteristic(
      Characteristic.OccupancyDetected,
      Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
    );
    if (this.stayOccupiedDelay) {
      this.occupancyService.setCharacteristic(
        Characteristic.TimeRemaining,
        this.stayOccupiedDelay
      );
    }

    if(this.maxOccupationTimeout > 0 && this._max_occupation_timer == null) {
      this._max_occupation_timer = setTimeout(
        this.setOccupancyNotDetected.bind(this),
        Math.round(this.maxOccupationTimeout * 1000)
      );
    }
    this.locksCounter -= 1;
  }

  setOccupancyNotDetected() {
    this.locksCounter += 1;
    this._last_occupied_state = false;
    this.wasTurnedOnByTriggerSwitch = false;
    this.stop();
    this.occupancyService.setCharacteristic(
      Characteristic.OccupancyDetected,
      Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED
    );
    if (this.stayOccupiedDelay) {
      this.occupancyService.setCharacteristic(Characteristic.TimeRemaining, 0);
    }

    if(this.maxOccupationTimeout > 0 && this._max_occupation_timer == null) {
      this._max_occupation_timer = setTimeout(
        this.setOccupancyNotDetected.bind(this),
        Math.round(this.maxOccupationTimeout * 1000)
      );
    }

    //Clear max timeout
    if (this._max_occupation_timer != null) {
      this.log("Max occupation timer stopped");
      clearTimeout(this._max_occupation_timer);
      this._max_occupation_timer = null;
    }

    //Turn all switches off
    var shutoff_switch = (aSwitch) => {
      aSwitch
        .getCharacteristic(Characteristic.On)
        .getValue(function(err, value) {
          if (!err && value) {
            aSwitch.setCharacteristic(Characteristic.On, false);
          }
        });
    }
    for (let i = 0; i < this.switchServices.length; i += 1) {
      shutoff_switch(this.switchServices[i]);
    }
    for (let i = 0; i < this.stayOnServices.length; i += 1) {
      shutoff_switch(this.stayOnServices[i]);
    }
    this.locksCounter -= 1;
  }

  /**
   * Checks all the trigger switchServices to see if any of them are on. If so this
   * Occupancy Sensor will remain "Occupied". This is used as a callback when
   * the "On" state changes on any of the trigger switchServices.
   */
  checkOccupancy(timeoutUntilCheck = 0) {
    if(this.locksCounter > 0) {
      this.log.debug(`checking occupancy waiting - in lockout state for at least 300ms`);
      timeoutUntilCheck = Math.max(300, timeoutUntilCheck);
    }

    if(timeoutUntilCheck > 0) {
      if(!this.isPendingCheckOccupancy) {
        this.isPendingCheckOccupancy = true;
        setTimeout(function() {
          this.checkOccupancy();
        }.bind(this), timeoutUntilCheck);
      }
      return;
    }

    this.locksCounter += 1;
    this.isPendingCheckOccupancy = false;
    this.log.debug(`checking occupancy. Total: ${this.switchServices.length}`);

    var switchesToCheck = [];
    switchesToCheck.push(...this.switchServices);
    //Stay-on switches only honored if we're already on
    if(this._last_occupied_state === true) {
      switchesToCheck.push(...this.stayOnServices);
    }

    /* callback for when all the switchServices values have been returned */
    var return_occupancy = (occupiedSwitchCount) => {
      const previousOccupiedState = this._last_occupied_state;

      if (occupiedSwitchCount > 0) {
        this.setOccupancyDetected();
      } else if (this._timer === null) {
        this.startUnoccupiedDelay();
      }

      this.log(
        `checkOccupancy result: ${occupiedSwitchCount}. Previous occupied state: ${previousOccupiedState}, current: ${this._last_occupied_state}`
      );
      this.locksCounter -= 1;

    };

    /*
        callback when we check a switchServices value. keeps track of the switchServices
        returned value and decides when to finish the function
      */
    var remainingCount = switchesToCheck.length;
    var occupiedSwitchCount = 0;
    var set_occupancy_switch_value_result = (value) => {
      this.log.debug(`Remaining Switches: ${remainingCount}, value: ${value}`);
      remainingCount -= 1;
      if (value) {
        occupiedSwitchCount += 1;
      }

      if (remainingCount == 0) {
        return_occupancy(occupiedSwitchCount);
      }
    };

    /* look at all the trigger switchServices "on" characteristic and return to callback */
    for (let i = 0; i < switchesToCheck.length; i += 1) {
      switchesToCheck[i]
          .getCharacteristic(Characteristic.On)
          .getValue(function(err, value) {
            if (!err) {
              set_occupancy_switch_value_result(value);
            } else {
              this.log(
                `ERROR GETTING VALUE ${err}`
              );
              set_occupancy_switch_value_result(false);
            }
          });
    }

    if(switchesToCheck.length == 0) {
      return_occupancy(0);
    }
  }

  /**
   * Homebridge function to return all the Services associated with this
   * Accessory.
   *
   * @returns {*[]}
   */
  getServices() {
    var services = [this.occupancyService, this.informationService];
    if(this.masterShutoffService != null) {
      services.push(this.masterShutoffService);
    }

    return services.concat([...this.switchServices, ...this.stayOnServices]);
  }
}

class OccupancyTriggerSwitch {
  constructor(occupancySensor, config) {
    this.log = occupancySensor.log;
    this.occupancySensor = occupancySensor;
    this.name = occupancySensor.name + " " + config.name;
    this.stayOnOnly = config.stayOnOnly;
    this.isMotion = config.isMotion;
    this.isTrigger = config.isTrigger || config.isMotion;
    this.stateful = !config.isTrigger;
    this.time = 2000;
    this.timer = null;
    this._service = new Service.Switch(this.name, this.name);

    this.cacheDirectory = occupancySensor.cacheDirectory;
    this.storage = occupancySensor.storage;

    this._service.getCharacteristic(Characteristic.On)
      .on('set', this._setOn.bind(this));

    if (this.stateful) {
      var cachedState = this.storage.getItemSync(this.name);
      if((cachedState === undefined) || (cachedState === false)) {
        this._service.setCharacteristic(Characteristic.On, false);
      } else {
        this._service.setCharacteristic(Characteristic.On, true);
      }
    }
  }

  _setOn(on, callback) {
    //Make sure we're actually full initialized
    if(!this.occupancySensor.initializationCompleted) {
      callback();
      return;
    }

    //Early return to break out on shutoff events when all switches are shutoff (like if master shutoff is triggered)
    if(!on && this.occupancySensor._last_occupied_state === false) {
      this.log("Setting " + this.name + " to off and bypassing all events");
      callback();
      return;
    }

    //If we're being turned on by a non-stateful switch, we need to know that - this means we should disable stateful switches
    if(on && this.occupancySensor._last_occupied_state === false && this.isTrigger && !this.stayOnOnly) {
      //Non-stateful switches
      this.occupancySensor.wasTurnedOnByTriggerSwitch = true;
      this.log("Setting wasTurnedOnByTriggerSwitch to true due to " + this.name);
    }

    this.log.debug("Setting switch " + this.name + " to " + on);

    //After a delay, if we were turned on by a trigger switch flip me back off
    if(!this.isMotion) {
      clearTimeout(this.timer)
      this.timer = setTimeout(function() {
        var treatStateful = this.stateful;
        if(this.stateful && this.occupancySensor.wasTurnedOnByTriggerSwitch && this.occupancySensor.ignoreStatefulIfTurnedOnByTrigger) {
          this.log("Treating stateful action to " + this.name + " as trigger due to wasTurnedOnByTriggerSwitch and ignoreStatefulIfTurnedOnByTrigger");
          treatStateful = false;
        }

        if (!treatStateful && on) {
          this._service.setCharacteristic(Characteristic.On, false);
        }
      }.bind(this), this.time);
    }

    callback();

    //Only dispatch appropriate events - all events from non stay-on and only from stay ons when on
    if(!this.stayOnOnly || this.occupancySensor._last_occupied_state === true) {
      this.occupancySensor.checkOccupancy(10);
    }
  }
}


class MasterShutoffSwitch {
  constructor(occupancySensor) {
    this.log = occupancySensor.log;
    this.occupancySensor = occupancySensor;
    this.name = occupancySensor.name + " Master Shutoff";
    this._service = new Service.Switch(this.name, this.name);

    this.cacheDirectory = occupancySensor.cacheDirectory;
    this.storage = occupancySensor.storage;

    this._service.setCharacteristic(Characteristic.On, false);
    this._service.getCharacteristic(Characteristic.On)
      .on('set', this._setOn.bind(this));

  }

  _setOn(on, callback) {
    //Make sure we're actually full initialized
    if(!this.occupancySensor.initializationCompleted) {
      callback();
      return;
    }


    if(on) {
      this.log("Setting master shutoff switch to on, killing everything");

      this.occupancySensor.locksCounter += 1;
      setTimeout(function() {
        this.occupancySensor.setOccupancyNotDetected();
        this._service.setCharacteristic(Characteristic.On, false);
      }.bind(this), 1);
      this.occupancySensor.locksCounter -= 1;

    }




    callback();
  }
}
