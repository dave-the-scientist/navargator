// =====  Common options and parameters
var page = {
  'server_url':'http://'+window.location.host, 'session_id':'', 'browser_id':'', 'instance_closed':false, 'maintain_interval':2000, 'maintain_interval_obj':null, 'max_upload_size':20000000
};
var repvar = {
  'leaves':[], 'chosen':[], 'available':[], 'ignored':[],
  'result_links':{}, 'tree_data':null, 'nodes':{}, 'r_paper':null, 'pan_zoom':null,
  'opts' : {
    'fonts' : {
      'tree_font_size':13, 'family':'Helvetica, Arial, sans-serif'
    },
    'sizes' : {
      'tree':null, 'small_marker_radius':2, 'big_marker_radius':4, 'bar_chart_height':30, 'labels_outline':0.5, 'inner_label_buffer':4, 'bar_chart_buffer':3, 'search_buffer':5
    },//3
    'colours' : {
      'node':'#E8E8E8', 'chosen':'#24F030', 'available':'#F09624', 'ignored':'#5D5D5D', 'search':'#B0F1F5', 'bar_chart':'#585858', 'tree_background':'#FFFFFF'
    }
  }
};

// =====  Convenience and error handling:
function showErrorPopup(message, title) {
  $("#errorDialogText").text(message);
  if (!title) {
    title = "Repvar error";
  }
  $("#errorDialog").dialog("option", "title", title);
  $("#errorDialog").dialog("open");
}
function processError(error, message) {
  console.log('Error occurred. The error object:');
  console.log(error);
  if (error.status == 559) {
    showErrorPopup(message+", as the server didn't recognize the given session ID. This generally means your session has timed out.");
  } else if (error.status == 0) {
    if (web_version) {
      showErrorPopup(message+", as no response was received. This may mean the web server is down.");
    } else {
      showErrorPopup(message+", as no response was received. This generally means the program has stopped.");
    }
  } else {
    showErrorPopup(message+"; the server returned code "+error.status);
  }
}

// =====  Page maintainance and management:
function generateBrowserId(length) {
  var b_id = 'b';
  for (var i=0; i<length; ++i) {
    b_id += Math.floor(Math.random() * 10); // Adds an integer from [0,9].
  }
  return b_id;
}
function daemonURL(url) {
  // Prefix used for private routes. Doesn't matter what it is, but it must match the daemonURL function in repvar_daemon.py
  return page.server_url + '/daemon' + url;
}
function maintainServer() {
  // This is continually called to maintain the background server.
  if (!page.instance_closed) {
    $.ajax({
      url: daemonURL('/maintain-server'),
      type: 'POST',
      data: {'session_id': page.session_id, 'browser_id': page.browser_id},
      error: function(error) {
        console.log('connection to Repvar server lost.');
        page.instance_closed = true;
        clearInterval(page.maintain_interval_obj);
      }
    });
  }
}
function closeInstance() {
  page.instance_closed = true;
  clearInterval(page.maintain_interval_obj);
  $.ajax({
    url: daemonURL('/instance-closed'),
    type: 'POST',
    data: {'session_id': page.session_id, 'browser_id': page.browser_id},
    async: false, // Makes a huge difference ensuring that this ajax call actually happens
    error: function(error) {
      console.log("Error closing your instance:");
      console.log(error);
    }
  });
}

function saveDataString(data_str, file_name, file_type) {
  // Uses javascript to save the string as a file to the client's download directory. This method works for >1MB svg files, for which other methods failed on Chrome.
  var data_blob = new Blob([data_str], {type:file_type});
  var data_url = URL.createObjectURL(data_blob);
  var download_link = document.createElement("a");
  download_link.href = data_url;
  download_link.download = file_name;
  document.body.appendChild(download_link);
  download_link.click();
  document.body.removeChild(download_link);
}

function validateSpinner(spinner, description) {
  if (spinner.spinner("isValid")) {
    return true;
  } else {
    var min = spinner.spinner("option", "min"),
        max = spinner.spinner("option", "max"),
        step = spinner.spinner("option", "step"), msg;
    if (max) { msg = description+" must be between "+min+" and "+max; }
    else { msg = description+" must be greater than "+min; }
    msg = msg+", and be a multiple of "+step+".";
    showErrorPopup(msg, "Parameter error");
    return false;
  }
}
