// core.js is loaded before this file, and defines the functions daemonURL, processError, maintainServer, closeInstance

// =====  Page settings:
var server_url='http://'+window.location.host, session_id='',
    maintain_wait=2000, instance_closed=false, maintain_interval;

// =====  Page setup:
function setupPage() {
  session_id = location.search.slice(1);
  console.log('start of setupPage', session_id);
  if (session_id != '') {
    // Only '' for non-pre-loaded web version. That doesn't get a maintain.
    console.log('pre interval');
    maintain_interval = setInterval(maintainServer, maintain_wait);
    // Sometimes this silently doesn't return.
    // One other time I got an error saying maintainServer was not defined.
    console.log('post interval');
    if (session_id != 'local_input_page') {
      // getData ajax call here.
      console.log('non-blank input from local version.');
    }
  }
  console.log('session id is ', session_id);
}
$(document).ready(function(){
  // Called once the document has loaded.
  setTimeout(setupPage, 10); // setTimeout is used because otherwise the setInterval call sometimes hangs. I think it's due to the page not being ready when the call happens.
});
$(window).bind('beforeunload', function() {
  // Lets the background server know this instance has been closed.
  closeInstance();
});
