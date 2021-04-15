# "Magic Occupancy Switch" Plugin


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
          "maxOccupationSeconds": 86400,
          "statefulSwitchesCount": 1,
          "triggerSwitchesCount": 1,
          "statefulStayOnSwitchesCount": 1,
          "triggerStayOnSwitchesCount": 1,
          "ignoreStatefulIfTurnedOnByTrigger": true,
          "createMasterShutoff": true
        }
    ]
```

## What problem will this solve?

This package is optimal for turning on lights in rooms via motion sensors or other triggers.
In an ideal world, if lights are turned on by a motion sensor you would want them to turn off when motion stops.
Also, ideally if you turned on the lights manually they would never turn off (or not turn off for a long time).

That's what this plugin does

This package exposes an occupation sensor with 5 different types of triggers.
- **Stateful (manual) Switch:** These switches activate the occupancy sensor immediately and keep the delay timer from resetting as long as the switch is on.
- **Trigger Stateless Switch:** These switches activate the occupancy sensor immediately and allow the delay timer to start immediately.
- **Stateful Stay-on Switches:** These switches will keep the delay timer from starting as long as the switch is on if the occupancy sensor is already on, or they will do nothing if not occupied already.
- **Trigger Stay-on Switches:** These switches will reset the delay if the occupancy sensor is already on, or they will do nothing if not occupied already.
- **Master Shutoff Switch:** Master shutoff toggled off kills occupancy immediately when toggled on.


When the stateful switch is turned on, the occupation sensor is turned on. When the stateful switch then turns off, the occupation sensor stays on for a customizable number of seconds which can be 0 (the Stay Occupied Delay).

When a trigger stateless switch is turned on, it stays on for a second before automatically turning on. When one of these switches turns on, it turns on the occupancy sensor while it's on and the occupancy sensor continues to stay on for the Stay Occupied Delay after the trigger finishes. This one is really useful for triggering with a motion detected event. You can use any combination of actions from these two types of switches to keep the occupation sensor on.

One interesting setting here is the "Ignore Stateful if Turned On By Trigger" setting. If this setting is turned on, if the occupation sensor is activated by a trigger type switch, the stateful (manual) switches will all act like trigger switches for the duration of that occupation cycle. This is very helpful for some complex types of automation.

The other two types of switches, Stateful and Trigger Stay-on Switches, act just like their non Stay-on siblings with one key difference - they can't activate the occupation sensor, only keep it active. These are useful, for example, if you have a hallway light that you want to turn on when the garage opens and keep on then as long as you have motion anywhere in the house (but you wouldn't want motion in the house to normally turn the light on).

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
          "maxOccupationSeconds": 86400,
          "statefulSwitchesCount": 1,
          "triggerSwitchesCount": 1,
          "statefulStayOnSwitchesCount": 1,
          "triggerStayOnSwitchesCount": 1,
          "ignoreStatefulIfTurnedOnByTrigger": true,
          "createMasterShutoff": true
        }
    ]
```

### HomeKit Automations
- When Hallway Lights turn on -> Turn on Hallway Occupancy Stateful Switch
- When Hallway Lights turn off -> Turn off Hallway Occupancy Master Switch
- When Hallway Occupancy Sensor Detects Occupancy -> Turn on Hallway Light
- When Hallway Occupancy Sensor Stops Detecting Occupancy -> Turn off Hallway Light
- When Hallway Motion Sensor Detects Motion -> Turn on Hallway Occupancy Trigger Switch

Now, when the Hallway Lights are manually turned on or off, they stay on until the switch is manually turned back off or the maxOccupationSeconds time (86400 seconds=1 day) elapses.
When the Hallway Lights are turned on by the motion sensor, they automatically turn off stayOccupiedDelay (60 seconds=1 minute) after motion stops (ignoreStatefulIfTurnedOnByTrigger crucially prevents the first automation from keeping the lights on forever).

### Additional Advanced HomeKit Automations
- When Kitchen Motion Sensor Detects Motion -> Turn on Hallway Occupancy Stay-on Trigger Switch
- When Dining Room Lights Turn on -> Turn on Hallway Occupancy Stay-on Stateful Switch
- When Dining Room Lights Turn off -> Turn off Hallway Occupancy Stay-on Stateful Switch

These automations add the fancy elements of keeping the hallway lights on for longer if they're already on and the kitchen lights turn on, and keeping the hallway lights on as long as the dining room lights are on (if the hallway lights are already on).
Fancy!
