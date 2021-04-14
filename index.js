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
 * manualTriggerCount (optional): Will create 1 trigger Switch with the same name as the
 *      Occupancy Sensor by default. Change this if you need more than 1 Switch
 *      to control the sensor.
 * delay: If set to less than 1 there will be no delay when all Switches are
 *      turned to off. Specify a number in seconds and the sensor will wait
 *      that long after all switches have been turned off to become
 *      "Un-occupied". If any trigger Switch is turned on the counter will clear
 *      and start over once all Switches are off again.
 *
 *
 * What can I do with this plugin?
 * @todo: Addd use case and instructions here.
 */
class MagicOccupancy {
  constructor(log, config) {
    this.log = log;
    this.name = config.name || "MagicOccupancy";
    this.manualTriggerCount = Math.max(0, config.manualTriggerCount || 1);
    this.automaticTriggerCount = Math.max(0, config.automaticTriggerCount || 1);
    this.delay = Math.min(3600, Math.max(0, parseInt(config.delay, 10) || 0));

    this._timer = null;
    this._timer_started = null;
    this._timer_delay = 0;
    this._interval = null;
    this._interval_last_value = 0;
    this._last_occupied_state = false;

    this.switchServices = [];
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

    /* Make the trigger switchServices */
    this.log("Making " + this.manualTriggerCount + " manual trigger switchServices");
    for (let i = 0, c = this.manualTriggerCount; i < c; i += 1) {
      this.switchServices.push(this._createSwitch(i + 1, true)._service);
    }
    /* Make the trigger switchServices */
    this.log("Making " + this.automaticTriggerCount + " auto trigger switchServices");
    for (let i = 0, c = this.automaticTriggerCount; i < c; i += 1) {
      this.switchServices.push(this._createSwitch(i + 1, false)._service);
    }
  }

  /**
   * Starts the countdown timer.
   */
  start() {
    this.stop();
    this._timer_started = new Date().getTime();
    this.log("Timer started:", this.delay);
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
    var remaining = this.switchServices.length,
      /* callback for when all the switchServices values have been returned */
      return_occupancy = (occupied) => {
        if (occupied) {
          if (this._last_occupied_state === !!occupied) {
            this.stop();
          } else {
            this.setOccupancyDetected();
          }
        } else if (null === this._timer) {
          this.start();
        }

        // @todo: Set a custom property for how many switchServices we're waiting for
        this.log(
          `checkOccupancy: ${occupied}. Last occupied state: ${this._last_occupied_state}`
        );
      },
      /*
          callback when we check a switchServices value. keeps track of the switchServices
          returned value and decides when to finish the function
        */
      set_value = (value) => {
        this.log(`Remaining: ${remaining}, value: ${value}`);
        remaining -= 1;
        if (value) {
          occupied += 1;
        }

        if (remaining === 0) {
          return_occupancy(occupied);
        }
      };

    /* look at all the trigger switchServices "on" characteristic and return to callback */
    for (const aSwitchService in this.switchServices) {
      aSwitchService
        .getCharacteristic(Characteristic.On)
        .getValue(function (err, value) {
          if (!err) {
            set_value(value);
          }
        });
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

    return [this.occupancyService, informationService, ...this.switchServices];
  }

  /**
   * Internal helper function to create a new "Switch" that is ties to the
   * status of this Occupancy Snesor.
   *
   * @param name
   * @returns {Service.Switch|*}
   * @private
   */
  _createSwitch(name, stateful) {
    return new OccupancyTriggerSwitch(this, {
        name: this.name + (stateful ? "Manual " : "Auto ") + (name || "").toString(),
        stateful: stateful,
        reverse: false,
        time: 1000,
        resettable: true,
        timer: null,
    });
  }
}

class OccupancyTriggerSwitch {
  constructor(occupancySensor, config) {
    this.log = occupancySensor.log;
    this.occupancySensor = config.occupancySensor;
    this.name = config.name;
    this.stateful = config.stateful;
    this.reverse = config.reverse;
    this.time = config.time ? config.time : 1000;
    this.resettable = config.resettable;
    this.timer = null;
    this._service = new Service.Switch(this.name);

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
      }.bind(this), this.time);
    } else if (!on && this.reverse && !this.stateful) {
      if (this.resettable) {
        clearTimeout(this.timer);
      }
      this.timer = setTimeout(function() {
        this._service.setCharacteristic(Characteristic.On, true);
      }.bind(this), this.time);
    }

    if (this.stateful) {
      this.storage.setItemSync(this.name, on);
    }

    this.occupancySensor.checkOccupancy();

    callback();
  }
}
