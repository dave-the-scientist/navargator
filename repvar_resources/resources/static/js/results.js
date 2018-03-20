// core.js is loaded before this file, and defines the functions daemonURL, processError, maintainServer, closeInstance

// =====  Page settings:
var server_url='http://'+window.location.host, session_id='',
    maintain_wait=2000, instance_closed=false, maintain_interval;

// =====  Page setup:
function setupPage() {
  session_id = location.search.slice(1);
  // getData ajax call here. Put this interval call in the ajax fxn.
  maintain_interval = setInterval(maintainServer, maintain_wait);

}
// Called once the document has loaded.
$(document).ready(function(){
  setupPage();
});
// Lets the background server know this instance has been closed.
$(window).bind('beforeunload', function() {
  closeInstance();
});
