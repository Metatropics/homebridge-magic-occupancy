# Homebridge "Magic Occupancy Switch" Plugin
[![npm version](https://badge.fury.io/js/homebridge-magic-occupancy.svg)](https://badge.fury.io/js/homebridge-magic-occupancy)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

**IF YOU ARE AN EXISTING USER OF HOMEBRIDGE-MAGIC-OCCUPANCY v2, DO NOT UPDATE TO v3 OF THIS PLUGIN UNLESS YOU ARE OKAY WITH YOUR PREVIOUS SETTINGS FOR THIS PLUGIN  BEING RESET TO DEFAULTS WHICH WILL LOSE ANY AUTOMATIONS YOU SET UP IN THE HOME APP BASED ON v2 SWITCHES AND SENSORS. v3 IS A SIGNIFICANT REWRITE AND OFFERS DIFFERENT OPTIONS THAN v2 WHICH ARE VERY POWERFUL BUT REQUIRE A MANUAL UPGRADE**

## How to install

 ```sudo npm install -g homebridge-magic-occupancy```

## Example config.json:
  **I recommend configuring the switch via the Homebridge X UI.** However, you may configure the plugin manually via config.json
 ```
    "accessories": [
        {
          "accessory": "MagicOccupancy",
          "name": "Hallway Occupancy",
          "stayOccupiedDelay": 60,
          "maxOccupationTimeout": 86400,
          "persistBetweenReboots": true,
          "startOnReboot": false,
          "lightSwitchesNames": "Light Switch 1, Light Switch 2",
          "statefulSwitchesNames": "Stateful Switch 1, Stateful Switch 2",
          "triggerSwitchesNames": "Trigger Switch 1, Trigger Switch 2",
          "statefulStayOnSwitchesNames": "Stateful Stay-On Switch 1, Stateful Stay-On Switch 2",
          "triggerStayOnSwitchesNames": "Trigger Stay-On Switch 1, Trigger Stay-On Switch 2",
          "createMasterShutoff": true
        }
    ]
```
To create multiple occupancy sensors in Homebridge X UI, scroll to the bottom of the plugin's settings and click the "Add Another" button to setup additional full Magic Occupancy configurations.

## What problem will this solve?

This package is optimal for turning on lights in rooms via motion sensors or other triggers.
In an ideal world, if lights are turned on by a motion sensor you would want them to turn off when motion stops.
Also, ideally if you turned on the lights manually they would never turn off (or not turn off for a long time).

That's what this plugin does

This package exposes an occupation sensor with six different types of triggers. You can combine any of them to create any behavior you'd like. There are four types of simple switches and two types of complex switches.
### Simple Switches:
- **Stateful (manual) Switch:** These switches activate the occupancy sensor immediately and keep the delay timer from resetting as long as the switch is on.
- **Trigger Stateless Switch:** These switches activate the occupancy sensor immediately and allow the delay timer to start immediately.
- **Stateful Stay-on Switches:** These switches will keep the delay timer from starting as long as the switch is on if the occupancy sensor is already on, or they will do nothing if not occupied already.
- **Trigger Stay-on Switches:** These switches will reset the delay if the occupancy sensor is already on, or they will do nothing if not occupied already.

### Complex Switches:
- **"Light" Switch:** These switches are designed to be paired with a light switch in a room where the occupancy sensor is used to turn the lights on (when lights on -> turn on "Light" Switch, when lights off -> turn off "Light" Switch). This switch will ALWAYS match the state of the occupancy sensor. If this type of switch is the one to activate occupancy, occupancy will stay active as long as this switch is turned on. However, if occupancy is triggered by another switch, this "Light" switch will not keep occupancy active (but occupancy will remain active as long as other switches are active). "Light" switches instantly end occupancy when switched off, much like the Master Shutoff Switch ends occupancy when turned on. See use case below for more details.
- **Master Shutoff Switch:** Master shutoff toggled off kills occupancy immediately when toggled on. This will flip all other switches to "off" instantly as well.

### More Info on Switches:
When the stateful switch is turned on, the occupation sensor is turned on. When the stateful switch then turns off, the occupation sensor stays on for a customizable number of seconds which can be 0 (the Stay Occupied Delay).

When a trigger stateless switch is turned on, it stays on for a second before automatically turning on. When one of these switches turns on, it turns on the occupancy sensor while it's on and the occupancy sensor continues to stay on for the Stay Occupied Delay after the trigger finishes. This one is really useful for triggering with a motion detected event. You can use any combination of actions from these two types of switches to keep the occupation sensor on.

The other two types of simple switches, Stateful and Trigger Stay-on Switches, act just like their non Stay-on siblings with one key difference - they can't activate the occupation sensor, only keep it active. These are useful, for example, if you have a hallway light that you want to turn on when the garage opens and keep on then as long as you have motion anywhere in the house (but you wouldn't want motion in the house to normally turn the light on).

The icing-on-the-cake switch is the "Light" switch. This switch is the key to the use case above - being able to balance a manual light switch and motion sensor. In essence, a "Light" switch is a stateful switch that is ideal for automation using lights. The key point is that because the switch is turned on automatically whenever motion is detected, it avoids a dead end of "Motion Sensor triggers Occupancy -> Occupancy Triggers Lights On -> Light On triggers a switch on Occupancy -> Motion sensor stops but occupancy stays on forever."

The final switch is the Master Shutoff switch. This switch will instantly turn off all the other switches and turn off the occupancy sensor when turned on. This is helpful for advanced automation use cases.

The last configuration setting of note is the "Absolute Max Occupation Time (auto-shutoff)". This lets you set a max time in seconds after which the occupation sensor should always turn itself off no matter what.

Overall this plugin is quite complex, but that's also what makes it powerful.


## Example Set of HomeKit Automations

Here is an example use case for how you can make this switch incredible powerful. This assumes your room is a hallway with a light and motion sensor.

### Homebridge config:
 ```
    "accessories": [
        {
          "accessory": "MagicOccupancy",
          "name": "Hallway Occupancy",
          "stayOccupiedDelay": 60,
          "maxOccupationTimeout": 86400,
          "persistBetweenReboots": true,
          "startOnReboot": false,
          "lightSwitchesNames": "Hallway Occupancy Light Switch",
          "statefulSwitchesNames": "Hallway Occupancy Motion Switch",
          "triggerSwitchesNames": "Hallway Occupancy Trigger Switch",
          "statefulStayOnSwitchesNames": "Hallway Occupancy Stay-On Stateful Switch",
          "triggerStayOnSwitchesNames": "Hallway Occupancy Stay-On Trigger Switch",
          "createMasterShutoff": false
        }
    ]
```

### HomeKit Automations
- When Hallway Lights turn on -> Turn on Hallway Occupancy Light Switch
- When Hallway Lights turn off -> Turn off Hallway Occupancy Light Switch
- When Hallway Occupancy Sensor Detects Occupancy -> Turn on Hallway Light
- When Hallway Occupancy Sensor Stops Detecting Occupancy -> Turn off Hallway Light
- When Hallway Motion Sensor Detects Motion -> Turn on Hallway Occupancy Motion Switch
- When Hallway Motion Sensor Stops Detecting Motion -> Turn off Hallway Occupancy Motion Switch

Now, when the Hallway Lights are manually turned on or off, they stay on until the switch is manually turned back off or the maxOccupationSeconds time (86400 seconds=1 day) elapses.
When the Hallway Lights are turned on by the motion sensor, they automatically turn off stayOccupiedDelay (60 seconds=1 minute) after motion stops.

### Additional Advanced HomeKit Automations
- When Garage Door Is Opened -> Turn on Hallway Occupancy Trigger Switch
- When Kitchen Motion Sensor Detects Motion -> Turn on Hallway Occupancy Stay-on Trigger Switch
- When Dining Room Lights Turn on -> Turn on Hallway Occupancy Stay-on Stateful Switch
- When Dining Room Lights Turn off -> Turn off Hallway Occupancy Stay-on Stateful Switch

These automations add the fancy elements of turning on the hallway lights when the garage opens, keeping the hallway lights on for longer if they're already on and the kitchen lights turn on, and keeping the hallway lights on as long as the dining room lights are on (if the hallway lights are already on).
Fancy!
