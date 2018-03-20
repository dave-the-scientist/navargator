// =====  Page settings:
var server_url='http://'+window.location.host, session_id='',
    maintain_wait=2000, instance_closed=false, maintain_interval;

// =====  Page setup:
function setupPage() {
  session_id = location.search.slice(1);
  if (session_id != '') {
    // Only '' for non-pre-loaded web version. That doesn't get a maintain.
    maintain_interval = setInterval(maintainServer, maintain_wait);
    if (session_id != 'local_input_page') {
      // getData ajax call here.
      console.log('non-blank input from local version.');
    }
  }
  console.log('session id is ', session_id);
}
// Called once the document has loaded.
$(document).ready(function(){
  setupPage();
});
// Lets the background server know this instance has been closed.
$(window).bind('beforeunload', function() {
  closeInstance();
});
