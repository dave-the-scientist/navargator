// core.js is loaded before this file, and defines the functions daemonURL, processError, maintainServer, closeInstance

// =====  Page settings:
var page = {
  'server_url':'http://'+window.location.host, 'session_id':'', 'maintain_interval':2000, 'instance_closed':false, 'maintain_interval_obj':null, 'max_upload_size':20000000
};
// =====  Tree objects and options:
var repvar = {
  'leaves':[], 'available':[], 'ignored':[], 'nodes':{},
  'r_paper':null, 'tree_data':null, 'panZoom':null,
  'opts' : {
    'fonts' : {
      'tree_font_size':13, 'family':'Helvetica, Arial, sans-serif'
    },
    'sizes' : {
      'tree':700, 'marker_radius':4, 'inner_label_buffer':3
    },
    'colours' : {
      'node':'#E8E8E8', 'chosen':'#24F030', 'available':'#F09624', 'ignored':'#5D5D5D'
    }
  }
};

// =====  Page setup:
function setupPage() {
  $("button").button(); // Converts all html buttons into jQuery-themed buttons. Provides style and features, including .button('disable')
  page.session_id = location.search.slice(1);
  var tree_width_str = getComputedStyle(document.getElementById("bodyTreeDiv")).getPropertyValue("--tree-width");
  repvar.opts.sizes.tree = parseInt(tree_width_str.slice(0,-2));
  repvar.panZoom = svgPanZoom('#figureSvg', {
    fit: false,
    center: false
  });
  setupRunOptions();
  setupNodeSelection();

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
        parseRepvarData(data_obj);
        clearInterval(page.maintain_interval_obj);
        page.maintain_interval_obj = setInterval(maintainServer, page.maintain_interval);
        drawTree();
        updateRunOptions();
        updateNodeSelection();
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
        parseRepvarData(data_obj);
        page.maintain_interval_obj = setInterval(maintainServer, page.maintain_interval);
        if (repvar.tree_data) {
          drawTree();
          updateRunOptions();
          updateNodeSelection();
        }
      },
      error: function(error) { processError(error, "Error loading input data from the server"); }
    });
  }
}
function setupRunOptions() {
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
  // Button callbacks:
  $("#rangeCheckbox").change(function() {
    if ($(this).is(':checked')) {
      $("#rangeSpinner").spinner('enable');
    } else {
      $("#rangeSpinner").spinner('disable');
    }
  });

  $("#availButton").click(function() {
    $("#nodeSelectSpan").html('available');
    $("#availButton").button('disable');
    $("#ignoreButton").button('disable');
    // Prepare the node selection checkboxes:
    if (repvar.available.length == repvar.leaves.length) {
      $("#nodeSelectAll").prop('checked', true);
    } else {
      $("#nodeSelectAll").prop('checked', false);
    }
    $(".node-select-checkbox").each(function() {
      var checkbox = $(this);
      var name = checkbox.prop('name');
      if (repvar.available.indexOf(name) != -1) {
        checkbox.prop('checked', true);
      } else {
        checkbox.prop('checked', false);
      }
      if (repvar.ignored.indexOf(name) != -1) {
        checkbox.attr('disabled', true);
      } else {
        checkbox.attr('disabled', false);
      }
    });
    $("#bodyNodeSelectDiv").show();
  });

  $("#ignoreButton").click(function() {
    $("#nodeSelectSpan").html('ignored');
    $("#ignoreButton").button('disable');
    $("#availButton").button('disable');
    // Prepare the node selection checkboxes:
    $("#nodeSelectAll").prop('checked', false);
    $(".node-select-checkbox").each(function() {
      var checkbox = $(this);
      var name = checkbox.prop('name');
      checkbox.attr('disabled', false);
      if (repvar.ignored.indexOf(name) != -1) {
        checkbox.prop('checked', true);
      } else {
        checkbox.prop('checked', false);
      }
    });
    $("#bodyNodeSelectDiv").show();
  });
  $("#availButton").button('disable');
  $("#ignoreButton").button('disable');
}
function setupNodeSelection() {
  $("#nodeSelectAll").change(function() {
    if ($(this).is(':checked')) {
      $(".node-select-checkbox").filter(':enabled').prop('checked', true);
    } else {
      $(".node-select-checkbox").filter(':enabled').prop('checked', false);
    }
  });
  $("#nodeSelectSaveButton").click(function() {
    var node_list = [];
    $(".node-select-checkbox").filter(':checked').each(function() {
      node_list.push($(this).prop('name'));
    });
    var node_type = $("#nodeSelectSpan").html();
    if (node_type == 'available') {
      repvar.available = node_list;
    } else if (node_type == 'ignored') {
      repvar.available = $.grep(repvar.available, function(n, i) { return (node_list.indexOf(n) == -1) });
      repvar.ignored = node_list;
    } else {
      alert("Error updating node selection.");
    }
    $("#bodyNodeSelectDiv").hide();
    updateRunOptions();
  });
  $("#nodeSelectCancelButton").click(function() {
    $("#bodyNodeSelectDiv").hide();
  });
}
function updateRunOptions() {
  // Updates the max on the number of variants spinner, and the labels of the choose available and ignored variant buttons. Should be called every time the available or ignored variants are modified.
  var maxVars = repvar.leaves.length - repvar.ignored.length;
  if (maxVars == 0) {
    maxVars = null;
  } else if (repvar.available.length >= 2) {
    maxVars = repvar.available.length;
  }
  $("#numVarSpinner").spinner('option', 'max', maxVars);
  $("#rangeSpinner").spinner('option', 'max', maxVars);
  $("#numAvailSpan").html(repvar.available.length);
  $("#numIgnoredSpan").html(repvar.ignored.length);
  $("#availButton").button('enable');
  $("#ignoreButton").button('enable');
  updateVariantMarkers();
}
function updateNodeSelection() {
  // Updates the list of variant checkboxes in the node selection pane. Should be called every time the phylogenetic tree is modified.
  for (var i=0; i<repvar.leaves.length; ++i) {
    var checkbox = $('<label><input type="checkbox" class="node-select-checkbox" />'+repvar.leaves[i]+'</label>');
    checkbox.children().prop('name', repvar.leaves[i]);
    $("#nodeSelectCheckboxes").append(checkbox);
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

// =====  Tree drawing functions:
function drawTree() {
  clearTree();
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
  setupVariantMarkers();
  // If adding other elements, can modify figure size here, and set the offset of the tree as well.
  $("#figureSvg").attr({'width':canvas_size, 'height':canvas_size});
  $("#treeSvg").attr({'x':0, 'y':0});
  $("#treeGroup").append($("#treeSvg")); // Move the elements from the original div to the displayed svg.
  $("#treeGroup").parent().prepend($("#treeGroup")); // Ensure this is below other elements in display stack.
}
function clearTree() {
  if (repvar.r_paper) {
    repvar.r_paper.remove();
  }
  $("#svgCanvas").empty();
  $("#treeGroup").empty();
}
function setupVariantMarkers() {
  repvar.nodes = {};
  var text_obj, var_name, var_coords, var_node;
  $("#treeSvg").find("text").each(function() {
    text_obj = $(this);
    var_name = text_obj.text();
    var_coords = parseLeafTextCoords(text_obj);
    var_node = repvar.r_paper.circle(var_coords.node_x, var_coords.node_y, repvar.opts.sizes.marker_radius);
    var_node.attr({fill:repvar.opts.colours.node, 'stroke-width':0.5});
    //$(var_node.node).attr("class","sequenceNode"); // Useful if I want mouseover actions.
    repvar.nodes[var_name] = {'circle': var_node, 'node_x':var_coords.node_x, 'node_y':var_coords.node_y, 'label_x':var_coords.label_x, 'label_y':var_coords.label_y};
  });
}
function updateVariantMarkers() {
  var var_name;
  for (var i=0; i<repvar.leaves.length; ++i) {
    var_name = repvar.leaves[i];
    if (repvar.available.indexOf(var_name) != -1) {
      repvar.nodes[var_name].circle.attr({fill:repvar.opts.colours.available});
    } else if (repvar.ignored.indexOf(var_name) != -1) {
      repvar.nodes[var_name].circle.attr({fill:repvar.opts.colours.ignored});
    } else {
      repvar.nodes[var_name].circle.attr({fill:repvar.opts.colours.node});
    }
  }
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
function parseLeafTextCoords(a_obj) {
  var coordsStr = $(a_obj).prev().attr("d");
  var L_ind = coordsStr.indexOf("L");
  var nodeCoords = coordsStr.slice(1, L_ind).split(",");
  var labelCoords = coordsStr.slice(L_ind+1).split(",");
  return {'node_x':parseFloat(nodeCoords[0]), 'node_y':parseFloat(nodeCoords[1]),
      'label_x':parseFloat(labelCoords[0]), 'label_y':parseFloat(labelCoords[1])};
}
