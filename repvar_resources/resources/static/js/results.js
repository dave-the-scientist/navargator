// core.js is loaded before this file, and defines the functions daemonURL, processError, maintainServer, closeInstance

// =====  Page settings:
var server_url='http://'+window.location.host, session_id='',
    maintain_wait=2000, instance_closed=false, maintain_interval;

// =====  Page setup:
function setupPage() {
  session_id = location.search.slice(1);
  maintain_interval = setInterval(maintainServer, maintain_wait); // This should be called before waiting for the getData ajax call.
  // getData ajax call here. Put this interval call in the ajax fxn.

}
// Called once the document has loaded.
$(document).ready(function(){
  setupPage();
});
// Lets the background server know this instance has been closed.
$(window).bind('beforeunload', function() {
  closeInstance();
});
