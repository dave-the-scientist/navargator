// core.js is loaded before this file, and defines the functions daemonURL, processError, maintainServer, closeInstance

// =====  Page settings:
var page = {
  'server_url':'http://'+window.location.host, 'session_id':'', 'maintain_wait':2000, 'instance_closed':false, 'maintain_interval':null, 'max_upload_size':20000000
};
// =====  Tree objects and options:
var repvar = {
  'leaves':[], 'r_paper':null, 'tree_data':null, 'panZoom':null,
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
  var total_label_size = (repvar.opts.sizes.marker_radius + repvar.opts.sizes.inner_label_buffer - 1 + maxLabelLength + Smits.PhyloCanvas.Render.Parameters.Circular.bufferOuterLabels) * 2.0;

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
  $("#treeGroup").parent().prepend($("#treeGroup")); // Ensure this is below other elements in stack.
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
