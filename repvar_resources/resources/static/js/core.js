// =====  Convenience and error handling:
function daemonURL(url) {
  // Prefix used for private routes. Doesn't matter what it is, but it must match the daemonURL function in repvar_daemon.py
  return server_url + '/daemon' + url;
}
function processError(error, message) {
  console.log('Error occurred. The error object:');
  console.log(error);
  if (error.status == 559) {
    alert(message+", as the server didn't recognize the given session ID. This generally means your session has timed out.");
  } else if (error.status == 0) {
    if (web_version) {
      alert(message+", as no response was received. This may mean the web server is down.");
    } else {
      alert(message+", as no response was received. This generally means the program has stopped.");
    }
  } else {
    alert(message+"; the server returned code "+error.status);
  }
}

// =====  Page maintainance and management:
function maintainServer() {
  // This is continually called to maintain the background server.
  if (!instance_closed) {
    $.ajax({
      url: daemonURL('/maintain-server'),
      type: 'POST',
      data: {'session_id': session_id},
      error: function(error) {
        console.log('connection to Repvar server lost.');
        instance_closed = true;
        clearInterval(maintain_interval);
      }
    });
  }
}
function closeInstance() {
  instance_closed = true;
  clearInterval(maintain_interval);
  $.ajax({
    url: daemonURL('/instance-closed'),
    type: 'POST',
    data: {'session_id': session_id},
    error: function(error) {
      console.log("Error closing your instance:");
      console.log(error);
    }
  });
}
