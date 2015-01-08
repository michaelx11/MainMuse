var model = require('./model');

function verifyUser(req, res) {
  if (!req.query) {
    res.send({"error": "no parameters."});
    return;
  }

  if (!(req.query.id && req.query.token)) {
    res.send({"error": "missing parameters"});
    return;
  }

  model.verifyFBAccessToken(req.query.id, req.query.token, function(error) {
    if (error) {
      res.send({"error": error});
      return;
    }

    res.send({"success": true});
  });
}

function initializeUser(req, res) {
  if (!req.query) {
    res.send({"error": "no parameters."});
    return;
  }

  var id = req.query.id;
  var token = req.query.token;
  var name = req.query.name;
  var email = req.query.email;

  if (!(id && token && name && email)) {
    res.send({"error": "missing parameters"});
    return;
  }

  console.log(req.query);

  model.initializeUser(id, token, name, email, function(accesstoken, error) {
    if (error) {
      res.send({"error": error});
      return;
    }

    res.send({"accesstoken": accesstoken});
  });
}

function addFriend(req, res) {
  if (!req.query) {
    res.send({"error": "no parameters."});
    return;
  }

  var id = req.query.id;
  var token = req.query.token;
  var code = req.query.friendcode;

  if (!(id && token && code)) {
    res.send({"error": "missing parameters."});
    return;
  }

  model.addFriend(id, token, code, function(error) {
    if (error) {
      res.send({'error': error});
    } else {
      res.send({'success': true});
    }
  });
}

function appendMessage(req, res) {
  if (!req.query) {
    res.send({"error": "no parameters."});
    return;
  }

  var id = req.query.id;
  var token = req.query.token;
  var targetid = req.query.targetid;
  var message = req.query.message;
  
  if (!(id && token && targetid && message)) {
    res.send({"error": "missing parameters."});
    return;
  }

  model.appendQueue(id, token, targetid, message, function(error) {
    if (error) {
      res.send({'error': error});
    } else {
      res.send({'success': true});
    }
  });
}


function editMessage(req, res) {
  if (!req.query) {
    res.send({"error": "no parameters."});
    return;
  }

  var id = req.query.id;
  var token = req.query.token;
  var targetid = req.query.targetid;
  var index = req.query.index;
  var message = req.query.message;

  if (!(id && token && targetid && index && message)) {
    res.send({"error": "missing parameters."});
    return;
  }

  model.editQueue(id, token, targetid, index, message, function(error) {
    if (error) {
      res.send({'error': error});
    } else {
      res.send({'success': true});
    }
  });
}

function readMessage(req, res) {
  if (!req.query) {
    res.send({"error": "no parameters."});
    return;
  }

  var id = req.query.id;
  var token = req.query.token;
  var sourceid = req.query.sourceid;

  if (!(id && token && sourceid)) {
    res.send({"error": "missing parameters."});
    return;
  }

  model.readQueue(id, token, sourceid, function(data, error) {
    if (error) {
      res.send({"error": error});
    } else {
      res.send({"message": data});
    }
  });
}

function getUserData(req, res) {
  if (!req.query) {
    res.send({"error": "no parameters."});
    return;
  }

  var id = req.query.id;
  var token = req.query.token;

  if (!(id && token)) {
    res.send({"error": "missing parameters."});
    return;
  }
  console.log(id);

  model.getUserData(id, token, function(userData, error) {
    if (error) {
      console.log(error);
      res.send({"error": error});
    } else {
      console.log("printing result");
      console.log(JSON.stringify(userData));
      res.send(userData);
    }
  });
}

exports.verifyUser = verifyUser;
exports.initializeUser = initializeUser;
exports.addFriend = addFriend;
exports.appendMessage = appendMessage;
exports.editMessage = editMessage;
exports.readMessage = readMessage;
exports.getUserData = getUserData;
