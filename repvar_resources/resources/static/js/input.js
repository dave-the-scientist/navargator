// core.js is loaded before this file, and defines the functions daemonURL, processError, maintainServer, closeInstance

// =====  Page settings:
var page = {
  'server_url':'http://'+window.location.host, 'session_id':'', 'maintain_interval':2000, 'instance_closed':false, 'maintain_interval_obj':null, 'max_upload_size':20000000
};
// =====  Tree objects and options:
var repvar = {
  'leaves':[], 'available':[], 'ignored':[],
  'r_paper':null, 'tree_data':null, 'panZoom':null,
  'opts' : {
    'fonts' : {
      'tree_font_size':13, 'family':'Helvetica, Arial, sans-serif'
    },
    'sizes' : {
      'tree':700, 'marker_radius':4, 'inner_label_buffer':3
    }
  }
};

// =====  Page setup:
function setupPage() {
  page.session_id = location.search.slice(1);
  var tree_width_str = getComputedStyle(document.getElementById("bodyTreeDiv")).getPropertyValue("--tree-width");
  repvar.opts.sizes.tree = parseInt(tree_width_str.slice(0,-2));

  $("#numVarSpinner").spinner({
    min: 2, max: null,
    numberFormat: 'N0', step: 1
  }).spinner('value', 3);
  $("#rangeSpinner").spinner({
    min: 2, max: null,
    numberFormat: 'N0', step: 1,
    disabled: true
  }).spinner('value', 3);
  $("#rangeCheckbox")[0].checked = false;
  repvar.panZoom = svgPanZoom('#figureSvg', {
    fit: false,
    center: false
  });

  // ===  Button callbacks
  $("#rangeCheckbox").change(function() {
    if ($(this).is(':checked')) {
      $("#rangeSpinner").spinner('enable');
    } else {
      $("#rangeSpinner").spinner('disable');
    }
  });
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
        parseUploadDataObj(data_obj);
        clearInterval(page.maintain_interval_obj);
        page.maintain_interval_obj = setInterval(maintainServer, page.maintain_interval);
        updateRunOptions();
        drawTree();
      },
      error: function(error) {
        processError(error, "Error uploading files");
      }
    });
  });

  if (page.session_id != '') {
    // This is only run for the local version.
    $.ajax({
      url: daemonURL('/get-input-data'),
      type: 'POST',
      data: {'session_id': page.session_id},
      success: function(data_obj) {
        console.log('get input success');
        parseRepvarData(data_obj);
        page.maintain_interval_obj = setInterval(maintainServer, page.maintain_interval);
        if (repvar.tree_data) {
          drawTree();
          // visualize available and ignored vars.
        }
      },
      error: function(error) { processError(error, "Error loading input data from the server"); }
    });
  }
}
function updateRunOptions() {
  var maxVars = repvar.leaves.length - repvar.ignored.length;
  if (maxVars == 0) {
    maxVars = null;
  } else if (repvar.available.length >= 2) {
    maxVars = repvar.available.length;
  }
  $("#numVarSpinner").spinner('option', 'max', maxVars);
  $("#rangeSpinner").spinner('option', 'max', maxVars);
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
function parseRepvarData(data_obj) {
  var data = $.parseJSON(data_obj);
  page.session_id = data.idnum;
  repvar.tree_data = data.phyloxml_data;
  repvar.leaves = data.leaves;
  repvar.available = data.available;
  repvar.ignored = data.ignored;
  if (data.hasOwnProperty('maintain_interval')) {
    page.maintain_interval = data.maintain_interval * 1000;
  }
}
function parseUploadDataObj(data_obj) {
  var data = $.parseJSON(data_obj);
  page.session_id = data.idnum;
  repvar.tree_data = data.phyloxml_data;
  repvar.leaves = data.leaves;
}

// =====  Tree drawing functions:
function drawTree() {
  loadPhyloSVG(); // Reloads jsPhyloSVG.

  Smits.PhyloCanvas.Render.Parameters.jsOverride = 1;
  Smits.PhyloCanvas.Render.Style.text["font-size"] = repvar.opts.fonts.tree_font_size;
  Smits.PhyloCanvas.Render.Style.text["font-family"] = repvar.opts.fonts.family;

  var canvas_size = repvar.opts.sizes.tree;
  var maxLabelLength = getMaxLabelLength(repvar.leaves);
  var total_label_size = (maxLabelLength + Smits.PhyloCanvas.Render.Parameters.Circular.bufferOuterLabels + repvar.opts.sizes.marker_radius + repvar.opts.sizes.inner_label_buffer - 1) * 2.0;

  Smits.PhyloCanvas.Render.Style.connectedDash['stroke'] = 'none';
  Smits.PhyloCanvas.Render.Parameters.Circular.bufferRadius = total_label_size/canvas_size;
  Smits.PhyloCanvas.Render.Parameters.Circular.bufferInnerLabels = repvar.opts.sizes.inner_label_buffer + repvar.opts.sizes.marker_radius + 1;
  var dataObject = {phyloxml: repvar.tree_data};
  var phylocanvas = new Smits.PhyloCanvas(
    dataObject,
    'svgCanvas',
    canvas_size, canvas_size,
    'circular'
  );
  $("#svgCanvas > svg").attr("id", "treeSvg");
  repvar.r_paper = phylocanvas.getSvg().svg;
  // If adding other elements, can modify figure size here, and set the offset of the tree as well.
  $("#figureSvg").attr({'width':canvas_size, 'height':canvas_size});
  $("#treeSvg").attr({'x':0, 'y':0});
  $("#treeGroup").append($("#treeSvg")); // Move the elements from the original div to the displayed svg.
  $("#treeGroup").parent().prepend($("#treeGroup")); // Ensure this is below other elements in display stack.
}
//   ===  Misc tree drawing functions:
function getMaxLabelLength(orig_names) {
  // Creates a new Raphael object, and prints the 10 longest (by character count), measuring the width of each.
  var names = orig_names.slice(), max = 0, toCheck = Math.min(names.length, 10);
  if (toCheck == 10) {
    names.sort(function(a, b) { return b.length - a.length; });
  }
  var paper = new Raphael('footerDiv', 1000,1000);
  for (var i=0; i<toCheck; ++i) {
    var t = paper.text(0,0, names[i]).attr(Smits.PhyloCanvas.Render.Style.text);
    var w = t.getBBox().width;
    t.remove();
    if (w > max) { max = w; }
  }
  paper.remove();
  return max;
}
