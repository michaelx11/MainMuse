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

  model.verifyAccessToken(req.query.id, req.query.token, function(error) {
    if (error) {
      res.send({"error": error});
      return;
    }

    res.send({"success": true});
  });
}

exports.verifyUser = verifyUser;
