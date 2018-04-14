// core.js then core_tree_functions.js are loaded before this file.

// This page is loaded, then continually checks with the server to see if the results are ready yet. It might be better (probably not) to use a Flask socket, that allows either the server or client to initiate communication. Good explanation here https://www.shanelynn.ie/asynchronous-updates-to-a-webpage-with-flask-and-socket-io/

// =====  Page settings:
var page = {
  'server_url':'http://'+window.location.host, 'session_id':'', 'maintain_interval':2000, 'instance_closed':false, 'maintain_interval_obj':null
};
// =====  Tree objects and options:
var repvar = {
  'leaves':[], 'chosen':[], 'available':[], 'ignored':[], 'nodes':{},
  'r_paper':null, 'tree_data':null, 'pan_zoom':null,
  'opts' : {
    'fonts' : {
      'tree_font_size':13, 'family':'Helvetica, Arial, sans-serif'
    },
    'sizes' : {
      'tree':null, 'marker_radius':4, 'bar_chart_height':30, 'inner_label_buffer':3, 'bar_chart_buffer':3, 'search_buffer':5
    },
    'colours' : {
      'node':'#E8E8E8', 'chosen':'#24F030', 'available':'#F09624', 'ignored':'#5D5D5D', 'search':'#B0F1F5'
    }
  }
};

//TODO:
// -- The maintainence is currently kind of a mess. Maybe it's not a good idea to copy the vf upon hitting Find variants. If user closes all result pages, i don't want the underlying vf to timeout. they should be able to pick new cluster numbers and re-run, or open previous results.
//    -- I think the copy should only happen when they press Run, if the avail/ignore/chosen are not equal to the existing vf. Then input.js should update it's own session id.
//    -- In fact, if I do this, I don't even need a copy. Upon updating those atts, the vf cache will be wiped (whicih is good), so all I need to do is switch the idnumber to a new one.
//    -- But if I do that, and the user had results pages (using the previous state) open, they will timeout. Maybe I still do want a copy, but now have the input page change what id it maintains.
//       -- If that's what I do, then the results links need to be cleared whenever the session id changes, instead of whenever a new tree is drawn.

// =====  Page setup:
function setupPage() {
  $(".jq-ui-button").button(); // Converts these html buttons into jQuery-themed buttons. Provides style and features, including .button('disable')
  $("#errorDialog").dialog({modal:true, autoOpen:false,
    buttons:{Ok:function() { $(this).dialog("close"); }}
  });
  page.session_id = location.search.slice(1);
  page.browser_id = generateBrowserId(10);
  console.log('browser ID:', page.browser_id); // TEST

  var tree_width_str = getComputedStyle(document.getElementById("mainTreeDiv")).getPropertyValue("--tree-width");
  repvar.opts.sizes.tree = parseInt(tree_width_str.slice(0,-2));
  page.maintain_interval_obj = setInterval(maintainServer, page.maintain_interval);

  setupTreeElements();

  $.ajax({
    url: daemonURL('/get-input-data'),
    type: 'POST',
    data: {'session_id': page.session_id},
    success: function(data_obj) {
      parseRepvarData(data_obj);
      drawTree();
      checkForClusteringResults();
    },
    error: function(error) { processError(error, "Error loading input data from the server"); }
  });
}
$(document).ready(function(){
  // Called once the document has loaded.
  setTimeout(setupPage, 10); // setTimeout is used because otherwise the setInterval call sometimes hangs. I think it's due to the page not being ready when the call happens.
});
$(window).bind('beforeunload', function() {
  // Lets the background server know this instance has been closed.
  closeInstance();
});

// =====  Page udating:
function checkForClusteringResults() {
  $.ajax({
    url: daemonURL('/get-cluster-results'),
    type: 'POST',
    data: {'session_id': page.session_id},
    success: function(data_obj) {
      console.log('checking data', data_obj);
    },
    error: function(error) { processError(error, "Error getting clustering data from the server"); }
  });
}

// =====  Data parsing:
function parseRepvarData(data_obj) {
  var data = $.parseJSON(data_obj);
  page.session_id = data.session_id;
  repvar.tree_data = data.phyloxml_data;
  repvar.leaves = data.leaves;
  repvar.chosen = data.chosen;
  repvar.available = data.available;
  repvar.ignored = data.ignored;
  if (data.hasOwnProperty('maintain_interval') && data.maintain_interval != page.maintain_interval*1000) {
    page.maintain_interval = data.maintain_interval * 1000;
    clearInterval(page.maintain_interval_obj);
    page.maintain_interval_obj = setInterval(maintainServer, page.maintain_interval);
  }
}
