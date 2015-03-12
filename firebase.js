/* Functions that interact with Firebase */

var Firebase = require('firebase');
var authConfig = require('./authConfig');
var root = new Firebase(authConfig.firebaseURL);
root.auth(authConfig.firebaseSecret);
var http = require('http');

/*
 * Schema
 *
 * minervastore
 *  users:
 *    michael:
 *      token: eightlet
 *      email: michaelx@mit.edu
 *      messages:
 *        otheruser:
 *          log:
 *            0: some message
 *            ...
 *        ...
 *      queues:
 *        otheruser:
 *          sync:
 *           head: 0
 *           tail: 20
 *           timestamp: 0
 *           interval: 3600 * 24 * 1000
 *           status: accepted [or pending]
 *        ...
 *      ...
 *    ...
 */
 
 
var DEFAULT_INTERVAL = 20 * 60 * 60 * 1000;
//var DEFAULT_INTERVAL = 2 * 60 * 1000;
var ADMIN_TOKEN = "LwL0cHXCSgYdeMeuCEqPLGcH";
var ADMIN_FRIEND_CODE = "MXMZMX";
var DEFAULT_SYNC_OBJECT = {status: "pending", head: 0, tail: 0, timestamp: 0, interval: DEFAULT_INTERVAL, name: ""};
var ADMIN = {'michael': true};

// Keep track of current active users
userList = {};
exports.userList = userList;

function sanitizeUsername(username) {
  return username.replace(/[\[\]\.$#,]/g,'');
}

function checkString(rawString) {
  return sanitizeUsername(rawString) === rawString;
}

function hasAdminPrivileges (user) {
  console.log(user);
  console.log(user in ADMIN);
  return user in ADMIN;
}

function getCurrTimeMillis() {
  return (new Date()).getTime();
}

function genSecret(length) {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (var i=0; i < length; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

function genSecretUpper(length) {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    for (var i=0; i < length; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

/**
 * Checks that username exists and that the provided token
 * matches the authentic token
 *
 */
function validateToken(username, token, cbNameError) {
  if (!checkString(username)) {
    cbNameError(false, "User id contains invalid characters.");
    return;
  }

  root.child('users')
    .child(username)
    .child('token').once('value', function(tokenData) {
      var storedToken = tokenData.val();
      if (!(storedToken && (storedToken === token))) {
        cbNameError(false, "Error token does not match.");
        return;
      }

      root.child('users')
        .child(username)
        .child('name').once('value', function(nameData) {
          var name = nameData.val();
          cbNameError(name, false);
        });
    });
}

/**
 * Checks that username exists
 */
function validateUser(username, cbError) {
  root.child('users')
    .child(username)
    .child('token').once('value', function(tokenData) {
      var storedToken = tokenData.val();
      if (!storedToken) {
        cbError("Error user " + username + " does not exist.");
        return;
      }

      cbError(false);
      return;
    });
}

/**
 * Either makes a blank queue with [status : accepted] or
 * sets the status to accepted for the queue corresponding to
 * "other friend".
 *
 * verifies:
 *  - username exists
 *  - token for username is correct
 *
 */
function addFriend(userid, token, otherFriendCode, cbNameError) {
  // check any paths used for Firebase
  if (!(checkString(userid) && checkString(otherFriendCode))) {
    cbNameError(false, "Invalid userid or friend code.");
    return;
  }

  validateToken(userid, token, function(name, error) {
    if (error) {
      cbNameError(false, error);
      return;
    }

    checkFriendCode(otherFriendCode, function(otherid, error2) {
      if (error2) {
        cbNameError(false, error2);
        return;
      }

      root.child('users')
        .child(otherid)
        .child('name').once('value', function(nameData) {
          var friendName = nameData.val();
          if (!friendName) {
            cbNameError(false, "Other user does not exist.");
            return;
          }
          // We can assume that the returned id is valid
          root.child('users')
            .child(userid)
            .child('queues')
            .child(otherid)
            .child('sync').transaction(function(syncObject) {
              // Either accept the request or build a new object with it accepted
              if (syncObject) {
                syncObject.status = "accepted";
                return syncObject;
              } else {
                var newSync = DEFAULT_SYNC_OBJECT;
                newSync.status = "accepted";
                newSync.name = friendName;
                return newSync;
              }
            }, function(err, committed, snapshot) {
              if (err) {
                cbNameError(false, err);
                return;
              }

              if (!committed) {
                cbNameError(false, "Add friend transaction aborted.");
                return;
              }

              cbNameError(friendName, false);
            });
        });
    });
  });
}

// NOTE: username and target user correspond to user id's, not full names
/**
 * Creates and sets up a queue belonging to [username] for [targetuser]
 *
 * verifies:
 *  - username exists
 *  - token for username is correct
 *  - targetuser exists
 *
 *  callback(error) - false if no error
 */
function createQueueIfNeeded(username, token, targetuser, cbError) {

  if (!(checkString(username) && checkString(targetuser))) {
    cbError("Username " + username + " or target username " + targetuser + " contains invalid characters.");
    return;
  }

  validateToken(username, token, function(name, error) {
    if (error) {
      cbError(error);
      return;
    }

    root.child('users')
      .child(targetuser)
      .child('queues')
      .child(username)
      .child('sync')
      .child('status').once('value', function(targetStatusData) {
        targetStatus = targetStatusData.val();

        if (targetStatus) {
          cbError(false);
          return;
        }

        validateUser(targetuser, function(error) {
          if (error) {
            cbError(error);
            return;
          }
          var syncObject = DEFAULT_SYNC_OBJECT;
          syncObject.name = name;
          var queue = {sync: syncObject};
          var messagelog = {log: {"-1" : "placeholder"}};

          root.child('users').child(targetuser).child('queues').child(username).set(queue);
          root.child('users').child(targetuser).child('messages').child(username).set(messagelog);
          cbError(false);
        });
    });
  });
}

function canGetNewMessage(syncObject) {
  if (!syncObject) {
    return false;
  }

  if (syncObject.head >= syncObject.tail) {
    return false;
  }

  var timestamp = syncObject.timestamp;
  var interval = syncObject.interval;

  var currentTimeMillis = getCurrTimeMillis();
  if (currentTimeMillis - timestamp < interval) {
    return false;
  }

  return true;
}

/**
 * Adds a message to the queue belonging to [username] for [targetuser]
 *
 * If the queue does not yet exist, create it
 *
 * verifies:
 *  - username exists
 *  - token for username is correct
 *  - targetuser exists
 */
function appendQueue(username, token, targetuser, message, cbError) {
  if (!(checkString(username) && checkString(targetuser))) {
    cbError("Username " + username + " or target username " + targetuser + " contains invalid characters.");
    return;
  }

  createQueueIfNeeded(username, token, targetuser, function(error) {
    if (error) {
      cbError(error);
      return;
    }

    root.child('users')
      .child(targetuser)
      .child('queues')
      .child(username)
      .child('sync').transaction(function(syncObj) {
        if (!syncObj) {
          // retry
          return DEFAULT_SYNC_OBJECT;
        }

        syncObj.tail = syncObj.tail + 1;
        return syncObj;
      }, function(err, committed, data) {
        if (err) {
          cbError(err);
          return;
        }
        if (!committed) {
          cbError('Append queue, transaction failed to commit');
          return;
        }

        var syncObj = data.val();
        if (!syncObj) {
          cbError("No sync data found in appendQueue.");
          return;
        }

        var newTail = syncObj.tail;
        if (!newTail) {
          cbError("Tail is undefined in appendQueue.");
          return;
        }

        root.child('users')
          .child(targetuser)
          .child('messages')
          .child(username)
          .child('log')
          .child(newTail).set(message);
        cbError(false);
      });
  });
}

function editQueue(userid, token, targetuser, index, message, cbError) {
  if (!(checkString(userid) && checkString(targetuser))) {
    cbError("User " + userid + " or target user " + targetuser + " contains invalid characters.");
    return;
  }

  validateToken(userid, token, function(name, error) {
    if (error) {
      cbError(error);
      return;
    }

    root.child('users')
      .child(targetuser)
      .child('queues')
      .child(userid)
      .child('sync').transaction(function(syncObj) {
        if (!syncObj) {
          // retry
          var obj = DEFAULT_SYNC_OBJECT;
          obj.name = name;
          return obj;
        }

        // Check if that message exists and is not the head
        if (parseInt(syncObj.head) < parseInt(index) && parseInt(index) <= parseInt(syncObj.tail)) {
          return syncObj;
        }

        // abort
        return;
      }, function(err, committed, data) {
        if (err) {
          cbError(err);
          return;
        }
        if (!committed) {
          cbError('Edit queue, transaction failed to commit');
          return;
        }
        var syncObj = data.val();
        if (!syncObj) {
          cbError("No sync data found in appendQueue.");
          return;
        }

        if (index > syncObj.head && index <= syncObj.tail) {
          root.child('users')
            .child(targetuser)
            .child('messages')
            .child(userid)
            .child('log')
            .child(index).set(message);
          cbError(false);
        } else {
          cbError("Index is no longer in a valid range");
        }
      });
  });
}

function readQueue(username, token, sourceuser, cbDataError) {
  if (!(checkString(username) && checkString(sourceuser))) {
    cbDataError(false, "Username " + username + " or source username " + sourceuser + " contains invalid characters.");
    return;
  }

  validateToken(username, token, function(name, error) {
    if (error) {
      cbDataError(false, error);
      return;
    }

    root.child('users')
      .child(username)
      .child('queues')
      .child(sourceuser)
      .child('sync').transaction(function(syncObj) {
        if (!syncObj) {
          // retry
          var obj = DEFAULT_SYNC_OBJECT;
          obj.name = name;
          return obj;
        }

        // Can get new item
        if (canGetNewMessage(syncObj)) {
          syncObj.head += 1;
          syncObj.timestamp = getCurrTimeMillis();
        }

        return syncObj;
      }, function(err, committed, data) {
        if (err) {
          cbDataError(false, err);
          return;
        }
        if (!committed) {
          cbDataError(false, 'Append queue, transaction failed to commit');
          return;
        }

        var syncObj = data.val();
        if (!syncObj) {
          cbDataError(false, "No sync data found in appendQueue.");
          return;
        }

        var head = syncObj.head;
        if (!head && head !== 0) {
          cbDataError(false, "Head is undefined in appendQueue.");
          return;
        }

        root.child('users')
          .child(username)
          .child('messages')
          .child(sourceuser)
          .child('log')
          .child(''+head).once('value', function(messageData) {
            var message = messageData.val();
            if (!message) {
              cbDataError(false, "Message does not exist yet");
              return;
            }
            
            cbDataError(JSON.parse(message), false);
            return;
          });
      });
  });
}


function checkFriendCode(code, cbDataError) {
  root.child('codes')
    .child(code).once('value', function(data) {
      var userId = data.val();
      if (!userId) {
        cbDataError(false, "Code does not exist.");
        return;
      }

      cbDataError(userId, false);
    });
}

function getUnusedFriendCode(counter, cbDataError) {
  var MAX_TRIES = 8;
  if (counter > MAX_TRIES) {
    cbDataError(false, "Failed to find unused token!");
    return;
  }
  var friendCode = genSecretUpper(6);
  checkFriendCode(friendCode, function(userId, error) {
    if (error) {
      cbDataError(friendCode, false);
      return;
    }
    getUnusedFriendCode(counter + 1, cbDataError);
  });
}

/**
 * Call this method only when the user id has been verified with Facebook
 * 
 * NOTE: really only needs a valid userid, the other parameters are used
 * if an account needs to be created
 */
function getUserAccessToken(name, userid, email, cbTokenError) {
  root.child('users')
    .child(userid)
    .child('token').once('value', function(tokenData) {
      var token = tokenData.val();
      if (!token) {
        createUser(name, userid, email, cbTokenError);
        return;
      }

      cbTokenError(token, false);
      return;
    });
}

function addAdminWelcomeMessage(newUserId, newUserToken, cbError) {
  
  addFriend(newUserId, newUserToken, ADMIN_FRIEND_CODE, function(name, err) {
    root.child('users')
      .child('admin')
      .child('welcomeMessage').once('value', function(messageData) {
        var messageObj = messageData.val();
        if (!messageObj) {
          cbError("No welcome message found.");
          return;
        }
        appendQueue('admin', ADMIN_TOKEN, newUserId, messageObj, function(error) {
          if (error) {
            cbError(error);
            return;
          }
          cbError(false);
        });
      });
  });
}

/**
 * Only call this method when the user id has been verified!
 */
function createUser(name, userid, email, cbTokenError) {
  if (!checkString(userid)) {
    cbTokenError(false, "Invalid user id!");
    return;
  }

  var userObj = {"name" : name, "id" : userid, "email" : email};

  var accessToken = genSecret(24);
  getUnusedFriendCode(0, function(friendCode, error) {
    if (error) {
      cbTokenError(false, "Could not obtain unused friend code.");
      return;
    }
    userObj['friendcode'] = friendCode;
    userObj['token'] = accessToken;

    root.child('users')
      .child(userid)
      .once('value', function(userData) {
        var storedUser = userData.val();
        if (storedUser) {
          cbTokenError(storedUser['token'], storedUser['friendcode'], false);
          return;
        }

        root.child('users').child(userid).set(userObj);
        root.child('codes').child(friendCode).set(userid);

        addAdminWelcomeMessage(userid, accessToken, function(error) {
          cbTokenError(accessToken, false);
        });
      });
  });
}

function getUserData(userid, token, cbUserError) {
  if (!checkString(userid)) {
    cbUserError(false, "User id contains invalid characters.");
    return;
  }
  root.child('users')
    .child(userid).once('value', function(userData) {
      var user = userData.val();
      if (!user['token']) {
        cbUserError(false, "Invalid user or token.");
        return;
      }

      var storedToken = user['token'];

      if (!(storedToken && (storedToken === token))) {
        cbUserError("Invalid user or token.");
        return;
      }

      cbUserError(user, false);
      return;
    });
}

// List of messages user has written to target
// Gets list of messages in the target queue 
function getMessageList(userid, token, targetuser, cbMessagesError) {
  if (!(checkString(userid) && checkString(targetuser))) {
    cbMessagesError(false, "userid " + userid + " or target userid " + targetuser + " contains invalid characters.");
    return;
  }

  validateToken(userid, token, function(name, error) {
    if (error) {
      cbMessagesError(false, error);
      return;
    }

    root.child('users')
      .child(targetuser)
      .child('queues')
      .child(userid)
      .child('sync').once('value', function(syncData) {
        var syncObj = syncData.val();
        if (syncObj) {
        } else {
          cbMessagesError(false, "Queue does not exist.");
          return;
        }

        var head = syncObj.head;
        var tail = syncObj.tail;

        root.child('users')
          .child(targetuser)
          .child('messages')
          .child(userid)
          .child('log').once('value', function(logData) {
            var log = logData.val();
            if (!log) {
              cbMessagesError(false, 'Message log does not exist.');
              return;
            }


            // The messages are stored as JSON strings
            var parsedObj = {};
            for (key in log) {
              if (parseInt(key) >= parseInt(head) && parseInt(key) <= parseInt(tail)) {
                parsedObj[key] = JSON.parse(log[key]);
              }
            }

            cbMessagesError(parsedObj, false);
          });
      });
  });
}

// List of message subject+data source has every written to user
function getMessagesFrom(userid, token, sourceuser, cbMessagesError) {
  if (!(checkString(userid) && checkString(sourceuser))) {
    cbMessagesError(false, "userid " + userid + " or source userid " + targetuser + " contains invalid characters.");
    return;
  }

  validateToken(userid, token, function(name, error) {
    if (error) {
      cbMessagesError(false, error);
      return;
    }

    root.child('users')
      .child(userid)
      .child('queues')
      .child(sourceuser)
      .child('sync').once('value', function(syncData) {
        var syncObj = syncData.val();
        if (syncObj) {
        } else {
          cbMessagesError(false, "Queue does not exist.");
          return;
        }

        var head = syncObj.head;
        var tail = syncObj.tail;

        root.child('users')
          .child(userid)
          .child('messages')
          .child(sourceuser)
          .child('log').once('value', function(logData) {
            var log = logData.val();
            if (!log) {
              cbMessagesError(false, 'Message log does not exist.');
              return;
            }


            // The messages are stored as JSON strings
            var parsedObj = {};
            for (key in log) {
              if (parseInt(key) <= parseInt(head)) {
                parsedObj[key] = JSON.parse(log[key]);
              }
            }

            cbMessagesError(parsedObj, false);
          });
      });
  });
}

exports.addFriend = addFriend;
exports.appendQueue = appendQueue;
exports.editQueue = editQueue;
exports.readQueue = readQueue;
exports.createUser = createUser;
exports.getUserData = getUserData;
exports.getUserAccessToken = getUserAccessToken;
exports.getMessageList = getMessageList;
exports.getMessagesFrom = getMessagesFrom;
