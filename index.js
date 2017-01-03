'use strict';

var Alexa = require('alexa-sdk');
var http = require('http');
var utils = require('util');

var util = require('util');
var moment = require('moment');
var config = require('./config.json');

var icloud = require("find-my-iphone").findmyphone;

icloud.apple_id = config.apple_id;
icloud.password = config.apple_password;

var alias = Object.keys(config.deviceMap).join("|");
var listOfNames = Array();
var currentName = 0;
var countOfNames = 0;

var states = {
    SEARCHMODE: '_SEARCHMODE',
    DETAILS: '_DETAILS'
};

// local variable holding reference to the Alexa SDK object
var alexa;

//OPTIONAL: replace with "amzn1.ask.skill.[your-unique-value-here]";
var APP_ID = config.app_id;

// Skills name
var skillName = "FindPhone";

// Message when the skill is first called
var welcomeMessage = "Welcome to Find My Friends.  You ask to find a phone by asking by the name ";

// Message for help intent
var helpMessage = "Help, You can ask to find a phone by using the person's device name";

// Used to tell user skill is closing
var shutdownMessage = "Ok see you again soon.";
var goodbyeMessage = "Happy to help, good bye";

// used for title on companion app
var cardTitle = "Find My Friends";

// output for Alexa
var output = "";

var welcomeRepromt = "You can ask to find a phone by using the person's device name";

// --------- Adding session handlers ----------------

Object.size = function(obj) {
    var size = 0, key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) size++;
    }
    return size; 
};

var newSessionHandlers = {

    'LaunchRequest': function () {
        this.handler.state = states.SEARCHMODE;

        output = welcomeMessage;
        var invocation = config.app_name;
        var name = "";

        countOfNames = Object.size(config.deviceMap);
        
        var key, i = 0;
        for (key in config.deviceMap) {
            name += key + ", ";
            listOfNames[i] = key;
            i++;
        }

        output = output + "<break time='1s'/> The Choices are " + name + ". .  You can also say <p> Next</p> to go through the list";
        this.emit(':ask', output, welcomeRepromt);
    },
   
    'AMAZON.HelpIntent': function () {
        this.handler.state = states.SEARCHMODE;

        var output = helpMessage;
        var invocation = config.app_name;
        var name = "";

        countOfNames = Object.size(config.deviceMap);
        
        var key, i = 0;
        for (key in config.deviceMap) {
            name += key + ", ";
            listOfNames[i] = key;
            i++;
        }

        output = output + "<break time='1s'/> The Choices are " + name + ". .  You can also say <p>Next</p> to go through the list";
        this.emit(':ask', output, welcomeRepromt);
    },

    // add search intent here
    'SearchIntent': function(){
        this.handler.state = states.SEARCHMODE;
        this.emitWithState('SearchIntent');
    },

    // add alert intent here
    'AlertIntent': function(){
        this.handler.state = states.SEARCHMODE;
        this.emitWithState('AlertIntent');
    },

    'Unhandled': function () {
        output = helpMessage;
        this.emit(':ask', output, welcomeRepromt);
    },
    'AMAZON.StopIntent': function () {
        this.emit(':tell', goodbyeMessage);
    },
    'SessionEndedRequest': function () {
        // Use this function to clear up and save any data needed between sessions
        this.emit('AMAZON.StopIntent');
    }
};


var startSearchHandlers = Alexa.CreateStateHandler(states.SEARCHMODE, {

    'AMAZON.HelpIntent': function () {
        this.handler.state = states.SEARCHMODE;

        var output = helpMessage;
        var invocation = config.app_name;
        var name = "";

        countOfNames = Object.size(config.deviceMap);
        
        var key, i = 0;
        for (key in config.deviceMap) {
            name += key + ", ";
            listOfNames[i] = key;
            i++;
        }

        output = output + "<break time='1s'/> The Choices are " + name + ". .  You can also say <p>Next</p> to go through the list";
        this.emit(':ask', output, welcomeRepromt);
    },

    'AMAZON.StopIntent': function () {
        this.emit(':tell', goodbyeMessage);
    },
  
    'AMAZON.NextIntent': function () {
        this.handler.state = states.DETAILS;
        this.emit(':ask', "Are you looking for " + listOfNames[currentName] + "?", helpMessage);
    },

    'AMAZON.YesIntent': function () {
        // if in SEARCHMODE then we know they tried finding someone but failed earlier
        if (this.handler.state == states.SEARCHMODE) {
            this.handler.state = states.DETAILS;
            this.emit(':ask', "Are you looking for " + listOfNames[currentName] + "?", helpMessage);

        } else {
            // must be coming from Next Intent since we ar ein DETAILS state
            this.handler.state = states.DETAILS;
            pr('Going to DetailsIntent');
            this.emitWithState('AMAZON.YesIntent');
        }
    },

    'AMAZON.NoIntent': function () {
        this.handler.state = states.DETAILS;
        this.emitWithState('AMAZON.NoIntent')
    },


    'AMAZON.RepeatIntent': function () {
        this.emit(':ask', output, helpMessage);
    },

    'SessionEndedRequest': function () {
        // Use this function to clear up and save any data needed between sessions
        this.emit('AMAZON.StopIntent');
    },

    'AMAZON.CancelIntent': function () {
        this.emit(':tell', goodbyeMessage);
    },

    'Unhandled': function () {
        output = helpMessage;
        this.emit(':ask', output, welcomeRepromt);
    },

    // -- custom intents --
    'SearchIntent': function () {

        var intent = this.event.request.intent;
        
        var name = getDeviceNameFromIntent(intent);
        if (name.indexOf("\'") == -1) {
            var saidDevice = name;
        } else {
            saidDevice = name.substring(0, name.indexOf("\'"));    
        }
        pr('said device name is '+ saidDevice);

        // check for the case of 'where is my phone...'
        if (saidDevice === "MY") {
            this.emitWithState('AMAZON.HelpIntent')
        }

        var possesiveDevice = saidDevice.replace("my", "your");
        var invocation = config.app_name;

        var instructions = util.format("You can also say, Alexa, ask %s to alert %s", invocation, saidDevice);

        if (!config.deviceMap.hasOwnProperty(saidDevice)) {
            instructions = util.format("Sorry, I cannot find %s in your devices.  Try again, or just say %s Help", possesiveDevice, invocation);
            alexa.emit(':tell', instructions);
        }

        var deviceName = config.deviceMap[saidDevice].deviceName;
        pr("DeviceName = <" + deviceName + ">");

        icloud.getDevices(function(error, devices) {

                if (error) {
                    var errMsg = "Something is wrong when contacting iCloud.  Probably the password is incorrect"
                    pr(errMsg);
                    alexa.emit(':tell', errMsg);
                }

                var device;

                devices.forEach(function(d) {
                    if (d.name.trim() === deviceName.trim()) {
                        device = d;
                    }
                    pr(d.name);
                });

                if (device) {

                    if (device.location == null) {
                        var msg = util.format("%s is currenly being located, ask me again in a few seconds.", possesiveDevice);
                        alexa.emit(':tell',  msg);
                    }

                    var myLatitude = config.latitude;
                    var myLongitude = config.longitude;

                    icloud.getDistanceOfDevice(device, myLatitude, myLongitude, function(err, result) {

                        if (result && result.distance && result.distance.value) {

                            var meters = result.distance.value;
                            var miles = Math.floor(meters * 0.000621371192);
                            var feet = Math.floor(meters * 3.28084);

                            msg = "";

                            if (device.location.timeStamp) {
                                var lastLocated = moment(device.location.timeStamp);
                                var now = moment();
                                var lastSeen = moment.duration(now.diff(lastLocated)).humanize();
                                msg = "As of " + lastSeen + " ago, ";
                            }

                            if (feet <= 1000) {
                                msg = util.format("%s %s is probably in the house, only %d feet away. %s",
                                    msg, possesiveDevice, feet, instructions);

                                alexa.emit(':tell', msg);
                            } else {

                                if (miles < 1) {
                                    msg = util.format("%s %s is %d feet away. %s", msg, possesiveDevice, feet, instructions);
                                    alexa.emit(':tell', msg);
                                } else {
                                    msg = util.format("%s %s is %d miles away", msg, possesiveDevice, miles);

                                    icloud.getLocationOfDevice(device, function(err, location) {
                                        if (location) {
                                            msg = util.format("%s, near %s", msg, location);
                                            if (result.duration) {
                                                msg = util.format("%s. Approximate driving time %s", msg, result.duration.text);
                                            }
                                        }
                                        alexa.emit(':tell', msg);
                                    });
                                }
                            }
                        } else {
                            alexa.emit(':tell', "Sorry, I can not calculate the distance of this device.");
                        }
                    });
                } else {
                    errMsg = util.format("Sorry, %s was not found.  Would you like to try again?", deviceName);
                    alexa.emit(':ask', errMsg, errMsg);
                }
            });
        
    },

    'AlertIntent': function () {

        var intent = this.event.request.intent;
        var name = getDeviceNameFromIntent(intent);
        if (name.indexOf("\'") == -1) {
            var saidDevice = name;
        } else {
            saidDevice = name.substring(0, name.indexOf("\'"));      
        }
        pr('said device name is '+ saidDevice);

        var invocation = config.app_name;
        var possesiveDevice = saidDevice.replace("my", "your");
        var instructions;

        if (!config.deviceMap.hasOwnProperty(saidDevice)) {
            instructions = util.format("Sorry, I cannot find %s in your device list", possesiveDevice);
            alexa.emit(':tell', instructions);
        }

        var deviceName = config.deviceMap[saidDevice].deviceName;

        icloud.getDevices(function(error, devices) {

                if (error) {
                    var errMsg = "Something is wrong when contacting iCloud.  Probably the password is incorrect"
                    pr(errMsg);
                    alexa.emit(':tell', errMsg);
                }

                var device;

                devices.forEach(function(d) {
                    if (d.name.trim() === deviceName.trim()) {
                        device = d;
                    }
                    pr(d.name);
                });

                if (device) {
                    icloud.alertDevice(device.id, function(err) {
                        msg = util.format("%s will now beep", possesiveDevice);
                        alexa.emit(':tell', msg);
                    });

                } else {
                    errMsg = util.format("Sorry, %s was not found.  Would you like to try again?", deviceName);
                    alexa.emit(':ask', errMsg), errMsg;
                }
        });
    }

});

var detailsHandlers = Alexa.CreateStateHandler(states.DETAILS, {
    
    'AMAZON.HelpIntent': function () {
        output = helpMessage;
        this.emit(':ask', output, helpMessage);
    },
    
    'AMAZON.CancelIntent': function () {
        this.handler.state = states.SEARCHMODE;
        alexa.emit(':tell', "Starting Over");
    },
 'AMAZON.NextIntent': function () {
       this.handler.state = states.SEARCHMODE;
        if (currentName < countOfNames -1) {
            currentName++;
        }
        this.emitWithState('AMAZON.NextIntent')
    },

    'AMAZON.YesIntent': function () {
        this.handler.state = states.SEARCHMODE;
        var saidDevice = listOfNames[currentName];

        var invocation = config.app_name;

        var deviceName = config.deviceMap[saidDevice].deviceName;
        var possesiveDevice = saidDevice;
        var instructions = util.format("You can also say, Alexa, ask %s to alert %s", invocation, saidDevice);

        icloud.getDevices(function(error, devices) {

                if (error) {
                    var errMsg = "Something is wrong when contacting iCloud.  Probably the password is incorrect"
                    pr(errMsg);
                    alexa.emit(':tell', errMsg);
                }

                var device;

                devices.forEach(function(d) {
                    if (d.name === deviceName) {
                        device = d;
                    }
                    pr(d.name);
                });

                if (device) {

                    if (device.location == null) {
                        var msg = util.format("%s is currenly being located, ask me again in a few seconds.", possesiveDevice);
                        alexa.emit(':tell',  msg);
                    }

                    var myLatitude = config.latitude;
                    var myLongitude = config.longitude;

                    icloud.getDistanceOfDevice(device, myLatitude, myLongitude, function(err, result) {

                        if (result && result.distance && result.distance.value) {

                            var meters = result.distance.value;
                            var miles = Math.floor(meters * 0.000621371192);
                            var feet = Math.floor(meters * 3.28084);

                            msg = "";

                            if (device.location.timeStamp) {
                                var lastLocated = moment(device.location.timeStamp);
                                var now = moment();
                                var lastSeen = moment.duration(now.diff(lastLocated)).humanize();
                                msg = "As of " + lastSeen + " ago, ";
                            }

                            if (feet <= 1000) {
                                msg = util.format("%s %s is probably in the house, only %d feet away. %s",
                                    msg, possesiveDevice, feet, instructions);

                                alexa.emit(':tell', msg);
                            } else {

                                if (miles < 1) {
                                    msg = util.format("%s %s is %d feet away. %s", msg, possesiveDevice, feet, instructions);
                                    alexa.emit(':tell', msg);
                                } else {
                                    msg = util.format("%s %s is %d miles away", msg, possesiveDevice, miles);

                                    icloud.getLocationOfDevice(device, function(err, location) {
                                        if (location) {
                                            msg = util.format("%s, near %s", msg, location);
                                            if (result.duration) {
                                                msg = util.format("%s. Approximate driving time %s", msg, result.duration.text);
                                            }
                                        }
                                        alexa.emit(':tell', msg);
                                    });
                                }
                            }
                        } else {
                            alexa.emit(':tell', "Sorry, I can not calculate the distance of this device.");
                        }
                    });
                } else {
                    errMsg = util.format("Sorry, %s was not found.  Would you like to try again?", deviceName);
                    alexa.emit(':ask', errMsg), errMsg;
                }
            });
    },

    'AMAZON.NoIntent': function () {
        this.handler.state = states.SEARCHMODE;
        if (currentName < countOfNames - 1) {
            currentName++;
        }
        this.emitWithState('AMAZON.NextIntent')
    },
  
    'AMAZON.StopIntent': function () {
        this.emit(':tell', goodbyeMessage);
    },
  
    'SessionEndedRequest': function () {
        // Use this function to clear up and save any data needed between sessions
        this.emit('AMAZON.StopIntent');
    },

    'Unhandled': function () {
        output = helpMessage;
        alexa.emit(':ask', output, welcomeRepromt);
    },

    // -- custom intents -- 

 
});

exports.handler = function (event, context, callback) {
    alexa = Alexa.handler(event, context);
    alexa.AppId = APP_ID;
    pr("APP_ID=" + alexa.AppId);
    alexa.registerHandlers(newSessionHandlers, startSearchHandlers, detailsHandlers);
    alexa.execute();
};


// --------- Helpers ---------------

function getDeviceNameFromIntent(intent) {

    var actionSlot = intent.slots.Name;
    // slots can be missing, or slots can be provided but with empty value.
    // must test for both.
    if (!actionSlot || !actionSlot.value) {
        return {error: true}
            
    } 
    else {
        return actionSlot.value.toUpperCase();
    }
}


function pr(str) {
    console.log(str);
}
