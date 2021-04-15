# "Occupancy Delay" Plugin


## How to install

 ```sudo npm install -g homebridge-magic-occupancy```

## Example config.json:
  **I recommend configuring the switch via the Homebridge X UI**
 ```
    "accessories": [
        {
          "accessory": "MagicOccupancy",
          "name": "MagicOccupancy",
          "stayOccupiedDelay": 5,
          "maxOccupationSeconds": 86400,
          "statefulSwitchesCount": 1,
          "triggerSwitchesCount": 1,
          "statefulStayOnSwitchesCount": 1,
          "triggerStayOnSwitchesCount": 1
        }
    ]
```

## What problem will this solve?

This package is optimal for turning on lights in rooms via motion sensors or other triggers.
In an ideal world, if lights are turned on by a motion sensor you would want them to turn off when motion stops.
Also, ideally if you turned on the lights manually they would never turn off (or not turn off for a long time).

That's what this package does

This package exposes an occupation sensor with 4 different types of triggers.
