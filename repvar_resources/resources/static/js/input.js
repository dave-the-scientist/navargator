// core.js is loaded before this file, and defines the functions daemonURL, processError, maintainServer, closeInstance

// =====  Page settings:
var page = {
  'server_url':'http://'+window.location.host, 'session_id':'', 'maintain_wait':2000, 'instance_closed':false, 'maintain_interval':null, 'max_upload_size':20000000
};
// =====  Tree objects:
var repvar = {
  'panZoom':null, 'tree_data':null
};

// =====  Page setup:
function setupPage() {
  page.session_id = location.search.slice(1);

  // ===  Button callbacks
  $("#uploadFileButton").click(function() {
    var file_obj = $("#uploadFileInput")[0].files[0];
    if (!file_obj) {
      alert("No file selected.");
      return false;
    } else if (file_obj.size > page.max_upload_size) {
      alert("The selected file exceeds the maximum upload size.");
      return false;
    }
    var form_data = new FormData($('#uploadFilesForm')[0]), upload_url = '';
    // Should have a drop-down to allow user to specify file type. Upon picking file, filename should be examined to automatically guess file type. Initially repvar and newick, but probably add phyloXML, etc.
    if (file_obj.name.toLowerCase().endsWith('.repvar')) {
      upload_url = daemonURL('/upload-repvar-file');
    } else {
      upload_url = daemonURL('/upload-newick-tree');
    }
    $.ajax({
      type: 'POST',
      url: upload_url,
      data: form_data,
      contentType: false,
      cache: false,
      processData: false,
      success: function(data_obj) {
        parseDataObj(data_obj);

        repvar.panZoom = svgPanZoom('#figureSvg', {
          fit: false,
          center: false
        });
        drawTree();
      },
      error: function(error) {
        processError(error, "Error uploading files");
      }
    });
  });

  if (page.session_id != '') {
    // Only '' for non-pre-loaded web version. That doesn't get a maintain.
    console.log('pre interval');
    page.maintain_interval = setInterval(maintainServer, page.maintain_wait);
    // Sometimes this silently doesn't return.
    // One other time I got an error saying maintainServer was not defined.
    console.log('post interval');
    if (page.session_id != 'local_input_page') {
      // getData ajax call here.
      console.log('non-blank input from local version.');
    }
  }
}
$(document).ready(function(){
  // Called once the document has loaded.
  setTimeout(setupPage, 10); // setTimeout is used because otherwise the setInterval call sometimes hangs. I think it's due to the page not being ready when the call happens.
});
$(window).bind('beforeunload', function() {
  // Lets the background server know this instance has been closed.
  closeInstance();
});

// =====  Data parsing:
function parseDataObj(data_obj) {
  var data = $.parseJSON(data_obj);
  console.log('data is', data);
  page.session_id = data.idnum;
  repvar.tree_data = data.phyloxml_data;
}

// =====  Tree drawing functions:
function drawTree() {
  loadPhyloSVG(); // Reloads jsPhyloSVG.

  var dataObject = {phyloxml: repvar.tree_data};
  var phylocanvas = new Smits.PhyloCanvas(
    dataObject,
    'svgCanvas',
    700, 700,
    'circular'
  );
}
