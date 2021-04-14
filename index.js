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
      "Timeout Delay",
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

/**
 * This accessory publishes an Occupancy Sensor as well as 1 or more trigger
 * Switches to control the status of the sensor. If any of the triggers are on
 * then this sensor registers as "Occupancy Detected" ("Occupied). When all
 * triggers are turned off this will remain "Occupied" for as long as the
 * specified delay.
 *
 * Config:
 *
 * name: The name of this Occupancy Sensor and it's trigger switches. If there are
 *      more than one triggers they will become "name 1", "name 2", etc.
 * statefulSwitchesCount (optional): Will create 1 trigger Switch with the same name as the
 *      Occupancy Sensor by default. Change this if you need more than 1 Switch
 *      to control the sensor.
 * delay: If set to less than 1 there will be no delay when all Switches are
 *      turned to off. Specify a number in seconds and the sensor will wait
 *      that long after all switches have been turned off to become
 *      "Un-occupied". If any trigger Switch is turned on the counter will clear
 *      and startUnoccupiedDelay over once all Switches are off again.
 *
 *
 * What can I do with this plugin?
 * @todo: Addd use case and instructions here.
 */
class MagicOccupancy {
  constructor(log, config) {
    this.log = log;
    this.name = config.name || "MagicOccupancy";
    this.statefulSwitchesCount = Math.max(0, config.statefulSwitchesCount || 1);
    this.triggerSwitchesCount = Math.max(0, config.triggerSwitchesCount || 1);
    this.statefulStayOnSwitchesCount = Math.max(0, config.statefulSwitchesCount || 1);
    this.triggerStayOnSwitchesCount = Math.max(0, config.triggerSwitchesCount || 1);
    this.delay = Math.min(3600, Math.max(0, parseInt(config.delay, 10) || 0));

    this._timer = null;
    this._timer_started = null;
    this._timer_delay = 0;
    this._interval = null;
    this._interval_last_value = 0;
    this._last_occupied_state = false;

    this.switchServices = [];
    this.stayOnServices = [];
    this.occupancyService = new Service.OccupancySensor(this.name);

    this.occupancyService.addCharacteristic(Characteristic.TimeoutDelay);
    this.occupancyService.setCharacteristic(
      Characteristic.TimeoutDelay,
      this.delay
    );
    this.occupancyService
      .getCharacteristic(Characteristic.TimeoutDelay)
      .on("change", (event) => {
        this.log("Setting delay to:", event.newValue);
        this.delay = event.newValue;
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
    this.log("Making " + this.statefulSwitchesCount + " Stateful trigger switchServices");
    for (let i = 0, c = this.statefulSwitchesCount; i < c; i += 1) {
      this.switchServices.push((new OccupancyTriggerSwitch(this, {
          name: "Stateful " + i.toString(),
          stateful: true,
          reverse: false,
      }))._service);
    }
    /* Make the triggerSwitches */
    this.log("Making " + this.triggerSwitchesCount + " Trigger trigger switchServices");
    for (let i = 0, c = this.triggerSwitchesCount; i < c; i += 1) {
      this.switchServices.push((new OccupancyTriggerSwitch(this, {
          name: "Trigger " + i.toString(),
          stateful: false,
          reverse: false,
          time: 5000,
          resettable: false,
      }))._service);
    }

    /* Make the statefulStayOnSwitches */
    this.log("Making " + this.statefulStayOnSwitchesCount + " Stateful trigger switchServices");
    for (let i = 0, c = this.statefulStayOnSwitchesCount; i < c; i += 1) {
      this.stayOnServices.push((new OccupancyTriggerSwitch(this, {
          name: "StayOn Stateful " + i.toString(),
          stateful: true,
          reverse: false,
      }))._service);
    }
    /* Make the triggerStayOnSwitches */
    this.log("Making " + this.triggerStayOnSwitchesCount + " Trigger trigger switchServices");
    for (let i = 0, c = this.triggerStayOnSwitchesCount; i < c; i += 1) {
      this.stayOnServices.push((new OccupancyTriggerSwitch(this, {
          name: "StayOn Trigger " + i.toString(),
          stateful: false,
          reverse: false,
          time: 5000,
          resettable: false,
      }))._service);
    }
  }

  /**
   * startUnoccupiedDelays the countdown timer.
   */
  startUnoccupiedDelay() {
    this.stop();
    this._timer_started = new Date().getTime();
    this.log("Timer startUnoccupiedDelayed:", this.delay);
    if (this.delay) {
      this._timer = setTimeout(
        this.setOccupancyNotDetected.bind(this),
        this.delay * 1000
      );
      this._timer_delay = this.delay;
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
  }

  /**
   * Stops the countdown timer
   */
  stop() {
    if (this._timer) {
      this.log("Timer stopped");
      clearTimeout(this._timer);
      clearInterval(this._interval);
      this._timer = null;
      this._timer_started = null;
      this._timer_delay = null;
      this._interval = null;
    }
  }

  setOccupancyDetected() {
    this.stop();
    this._last_occupied_state = true;
    this.occupancyService.setCharacteristic(
      Characteristic.OccupancyDetected,
      Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
    );
    if (this.delay) {
      this.occupancyService.setCharacteristic(
        Characteristic.TimeRemaining,
        this.delay
      );
    }
  }

  setOccupancyNotDetected() {
    this._last_occupied_state = false;
    this.stop();
    this.occupancyService.setCharacteristic(
      Characteristic.OccupancyDetected,
      Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED
    );
    if (this.delay) {
      this.occupancyService.setCharacteristic(Characteristic.TimeRemaining, 0);
    }
  }

  /**
   * Checks all the trigger switchServices to see if any of them are on. If so this
   * Occupancy Sensor will remain "Occupied". This is used as a callback when
   * the "On" state changes on any of the trigger switchServices.
   */
  checkOccupancy() {
    this.log(`checking occupancy. Total: ${this.switchServices.length}`);

    var occupied = 0;
    var remainingPrimary = this.switchServices.length;
    var remainingStayOn = this.stayOnServices.length;

    /* callback for when all the switchServices values have been returned */
    var return_occupancy = (occupied) => {
      if (occupied > 0) {
        if (this._last_occupied_state !== true) {
          this.setOccupancyDetected();
        }
      } else if (this._timer === null) {
        if (this._last_occupied_state !== false) {
          this.startUnoccupiedDelay();
        }
      }

      // @todo: Set a custom property for how many switchServices we're waiting for
      this.log(
        `checkOccupancy: ${occupied}. Last occupied state: ${this._last_occupied_state}`
      );
    };

    /*
        callback when we check a switchServices value. keeps track of the switchServices
        returned value and decides when to finish the function
      */
    var set_value = (value) => {
      this.log(`Remaining: ${remainingPrimary}, value: ${value}`);
      remainingPrimary -= 1;
      if (value) {
        occupied += 1;
      }

      if (remainingPrimary <= 0) {
        if(occupied === true || this._last_occupied_state === false || this.stayOnServices.length <= 0) {
          return_occupancy(occupied);
        }

        var set_stayOn_value = (value) => {
          this.log(`Remaining: ${remaining}, value: ${value}`);
          remainingStayOn -= 1;
          if (value) {
            occupied += 1;
          }

          if (remainingStayOn <= 0) {
            return_occupancy(occupied);
          }
        };

        /* look at all the trigger switchServices "on" characteristic and return to callback */
        for (let i = 0; i < this.stayOnServices.length; i += 1) {
          this.stayOnServices[i]
              .getCharacteristic(Characteristic.On)
              .getValue(function(err, value) {
                if (!err) {
                  set_stayOn_value(value);
                }
              });
        }
      }
    };

    /* look at all the trigger switchServices "on" characteristic and return to callback */
    for (let i = 0; i < this.switchServices.length; i += 1) {
      this.switchServices[i]
          .getCharacteristic(Characteristic.On)
          .getValue(function(err, value) {
            if (!err) {
              set_value(value);
            }
          });
    }

    if(this.switchServices.length == 0) {
      set_value(false);
    }
  }

  /**
   * Homebridge function to return all the Services associated with this
   * Accessory.
   *
   * @returns {*[]}
   */
  getServices() {
    var informationService = new Service.AccessoryInformation()
      .setCharacteristic(Characteristic.Manufacturer, "github.com/Jason-Morcos")
      .setCharacteristic(Characteristic.Model, "2")
      .setCharacteristic(Characteristic.SerialNumber, "JmoMagicOccupancySwitch");

    return [this.occupancyService, informationService, ...this.switchServices, ...this.stayOnServices];
  }
}

class OccupancyTriggerSwitch {
  constructor(occupancySensor, config) {
    this.log = occupancySensor.log;
    this.occupancySensor = occupancySensor;
    this.name = occupancySensor.name + ": " + config.name;
    this.stateful = config.stateful;
    this.reverse = config.reverse;
    this.time = config.time ? config.time : 1000;
    this.resettable = config.resettable;
    this.timer = null;
    this._service = new Service.Switch(config.name, this.name);

    this.cacheDirectory = occupancySensor.cacheDirectory;
    this.storage = occupancySensor.storage;

    this._service.getCharacteristic(Characteristic.On)
      .on('set', this._setOn.bind(this));

    if (this.reverse) {
      this._service.setCharacteristic(Characteristic.On, true);
    }

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

    this.log("Setting switch to " + on);

    if (on && !this.reverse && !this.stateful) {
      if (this.resettable) {
        clearTimeout(this.timer);
      }
      this.timer = setTimeout(function() {
        this._service.setCharacteristic(Characteristic.On, false);
        this.occupancySensor.checkOccupancy();
      }.bind(this), this.time);
    } else if (!on && this.reverse && !this.stateful) {
      if (this.resettable) {
        clearTimeout(this.timer);
      }
      this.timer = setTimeout(function() {
        this._service.setCharacteristic(Characteristic.On, true);
        this.occupancySensor.checkOccupancy();
      }.bind(this), this.time);
    }

    if (this.stateful) {
      this.storage.setItemSync(this.name, on);
    }

    this.occupancySensor.checkOccupancy();

    callback();
  }
}
