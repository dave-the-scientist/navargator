// =====  Tree setup functions:
function setupTreeElements() {
  repvar.pan_zoom = svgPanZoom('#figureSvg', {
    fit: false,
    center: false
  });
  $('#varSearchButton').click(function() {
    treeSearchFunction();
  });
  $("#clearVarSearchButton").click(function() {
    $("#varSearchInput").attr('value', '');
    treeSearchFunction();
  });
  $('#treeZoomOutButton').click(function() {
    repvar.pan_zoom.zoomOut();
  });
  $('#treeZoomInButton').click(function() {
    repvar.pan_zoom.zoomIn();
  });
  $('#treeZoomResetButton').click(function() {
    repvar.pan_zoom.resetZoom();
    repvar.pan_zoom.resetPan();
  });
}

// =====  Tree use functions:
function treeSearchFunction() {
  var query = $('#varSearchInput').attr('value').trim().toLowerCase();
  var name, num_hits = 0;
  for (var i=0; i<repvar.leaves.length; ++i) {
    name = repvar.leaves[i];
    if (query == '' || name.toLowerCase().indexOf(query) == -1) {
      repvar.nodes[name]['search_highlight'].hide();
    } else {
      num_hits += 1;
      repvar.nodes[name]['search_highlight'].show();
    }
  }
  if (query == '') {
    $("#varSearchHitsText").text('');
  } else {
    $("#varSearchHitsText").text(num_hits+' hits');
  }
  return false;
}

// =====  Tree drawing functions:
function drawTree() {
  clearTree();
  loadPhyloSVG(); // Reloads jsPhyloSVG.

  var tree_params = Smits.PhyloCanvas.Render.Parameters,
    tree_style = Smits.PhyloCanvas.Render.Style,
    sizes = repvar.opts.sizes;

  tree_params.jsOverride = 1;
  tree_style.text["font-size"] = repvar.opts.fonts.tree_font_size;
  tree_style.text["font-family"] = repvar.opts.fonts.family;
  tree_style.connectedDash['stroke'] = 'none';

  var canvas_size = sizes.tree;
  var maxLabelLength = getMaxLabelLength(repvar.leaves);
  var total_label_size = (maxLabelLength + tree_params.Circular.bufferOuterLabels + sizes.marker_radius + sizes.inner_label_buffer + sizes.bar_chart_buffer + sizes.bar_chart_height - 1) * 2.0;

  tree_params.Circular.bufferRadius = total_label_size/canvas_size;
  tree_params.Circular.bufferInnerLabels = sizes.inner_label_buffer + sizes.marker_radius + 1;
  var data_object = {phyloxml: repvar.tree_data};
  var phylocanvas = new Smits.PhyloCanvas(
    data_object,
    'svgCanvas',
    canvas_size, canvas_size,
    'circular'
  );
  $("#svgCanvas > svg").attr("id", "treeSvg");
  repvar.r_paper = phylocanvas.getSvg().svg;
  setupVariantObjects();
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
function setupVariantObjects() {
  // Collects coordinates and angles for nodes and their names, and creates their markers and highlights.
  repvar.nodes = {};
  var text_obj, var_name, var_coords, var_marker;
  $("#treeSvg").find("text").each(function() {
    text_obj = $(this);
    var_name = text_obj.text();
    var_coords = parseLeafTextCoords(text_obj);
    var_marker = repvar.r_paper.circle(var_coords.node_x, var_coords.node_y, repvar.opts.sizes.marker_radius);
    var_marker.attr({fill:repvar.opts.colours.node, 'stroke-width':0.5});
    //$(var_marker.node).attr("class","sequenceNode"); // Useful if I want mouseover actions.
    repvar.nodes[var_name] = {'circle': var_marker, 'node_x':var_coords.node_x, 'node_y':var_coords.node_y, 'label_x':var_coords.label_x, 'label_y':var_coords.label_y};
  });
  var var_angle, label_path_str, var_highlight_set, label_highlight, marker_highlight, var_line_highlight, node_x, node_y, label_x, label_y;
  var angle_offset = treeDrawingParams.scaleAngle / 2,
    label_highlight_start_radius = treeDrawingParams.minBGRadius+repvar.opts.sizes.marker_radius+1,
    label_highlight_end_radius = treeDrawingParams.barChartRadius + repvar.opts.sizes.bar_chart_buffer + repvar.opts.sizes.bar_chart_height + repvar.opts.sizes.search_buffer,
    marker_highlight_radius = repvar.opts.sizes.marker_radius * 1.5 + 1;
  for (var i=0; i<treeDrawingParams.seqs.length; ++i) {
    var_name = treeDrawingParams.seqs[i][0];
    var_angle = treeDrawingParams.seqs[i][1];
    node_x = repvar.nodes[var_name].node_x, node_y = repvar.nodes[var_name].node_y;
    label_x = repvar.nodes[var_name].label_x, label_y = repvar.nodes[var_name].label_y;
    var_highlight_set = repvar.r_paper.set();
    // Highlight around the sequence name.
    label_path_str = sectorPathString(label_highlight_start_radius, label_highlight_end_radius, var_angle-angle_offset, var_angle+angle_offset);
    label_highlight = repvar.r_paper.path(label_path_str);
    //$(label_highlight.node).attr("class","sequenceNode");
    //$(label_highlight.node).prop('seqID', seqID); // These 2 useful for mouseover events.

    // Highlight around the tree node.
    marker_highlight = repvar.r_paper.circle(node_x, node_y, marker_highlight_radius);
    // Highlight connecting the tree node and the sequence name.
    var_line_highlight = repvar.r_paper.path('M'+node_x+','+node_y+' L'+label_x+','+label_y);
    // Grouping the highlights, and storing the object.
    var_highlight_set.push(label_highlight, marker_highlight, var_line_highlight);
    var_highlight_set.attr({'stroke-width':0, fill:repvar.opts.colours.search}).toBack().hide();
    var_line_highlight.attr({'stroke-width':2, stroke:repvar.opts.colours.search});
    repvar.nodes[var_name]['search_highlight'] = var_highlight_set;
  }
}
function updateVariantMarkers() {
  var var_name;
  for (var i=0; i<repvar.leaves.length; ++i) {
    var_name = repvar.leaves[i];
    if (repvar.chosen.indexOf(var_name) != -1) {
      repvar.nodes[var_name].circle.attr({fill:repvar.opts.colours.chosen});
    } else if (repvar.available.indexOf(var_name) != -1) {
      repvar.nodes[var_name].circle.attr({fill:repvar.opts.colours.available});
    } else if (repvar.ignored.indexOf(var_name) != -1) {
      repvar.nodes[var_name].circle.attr({fill:repvar.opts.colours.ignored});
    } else {
      repvar.nodes[var_name].circle.attr({fill:repvar.opts.colours.node});
    }
  }
}
//   ===  Misc tree drawing functions:
var radians_per_degree = (Math.PI / 180);
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
  labelCoords = moveAwayFromCentre(labelCoords, repvar.opts.sizes.marker_radius+1);
  return {'node_x':parseFloat(nodeCoords[0]), 'node_y':parseFloat(nodeCoords[1]),
      'label_x':parseFloat(labelCoords[0]), 'label_y':parseFloat(labelCoords[1])};
}
function sectorPathString(r1, r2, y1, y2) {
  // Adapted from sector() and secant() from jsphylosvg.js
  var coords1 = secPosition(r1, y1), coords2 = secPosition(r2, y2);
  return [["M", coords1[0], coords1[1]], secant(r1, y1, y2, 0),
            ["L", coords2[0], coords2[1]], secant(r2, y2, y1, 1), ['Z']];
}
function secPosition(r, deg){
  deg += treeDrawingParams.initStartAngle;
  return [roundFloat(treeDrawingParams.cx + r * Math.sin(deg * radians_per_degree), 4),
          roundFloat(treeDrawingParams.cy + r * Math.cos(deg * radians_per_degree), 4)];
}
function secant(r, startAngle, endAngle, invSecant){
  var endPos = secPosition(r, endAngle);
  var n, inv = 0;
  if(Math.abs(normalizeAngle(endAngle-startAngle)) > 180) {
    n = 1;
  } else {
    n = -1;
  }
  if(invSecant){
    n *= -1;
    inv = 1;
  }
  return ["A", r, r, 0, n < 1 ? 0 : 1, inv, endPos[0], endPos[1]];
}
function moveAwayFromCentre(point, distance) {
  // Given point=[x,y], coordinates on the tree svg, returns the coordinates of a point
  // on the line from that point to the centre, 'distance' further away. If a negative
  // distance is given, the point will be closer to the centre.
  var v, len, u, centreX = treeDrawingParams.cx, centreY = treeDrawingParams.cy;
  v = [centreX-point[0], centreY-point[1]];
  len = Math.sqrt(v[0]*v[0] + v[1]*v[1]);
  u = [v[0]/len, v[1]/len];
  return [point[0]-distance*u[0], point[1]-distance*u[1]];
}
function roundFloat(num, num_dec) {
  var x = Math.pow(10, num_dec);
  return Math.round(num * x) / x;
}
function normalizeAngle(ang){
  while(ang > 360 || ang < 0) {
    if(ang > 360){ ang -= 360; }
    else if (ang < 0){ ang += 360; }
  }
  return ang;
}
