// TODO:
// - Ensure bar graph is below the label mouseover object. Add the tooltip to that object.
// - For histo selection, think I want one slider (with input box), with buttons on either edge. Initially left says 'add to selection' and adds all nodes in range (visualized by mouseover) to selection; right says 'switch to above' and on press it changes to 'add to selection' and causes left to change to 'switch to below', and updates the range (visualized with mouseover).

// =====  Tree setup functions:
function setupTreeElements() {
  repvar.pan_zoom = svgPanZoom('#figureSvg', {
    fit: false,
    center: false,
    dblClickZoomEnabled: false,
    mouseWheelZoomEnabled: false,
    onPan: preventSelections
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
  $('#scrollZoomButton').click(function() {
    if (repvar.pan_zoom.isMouseWheelZoomEnabled() == true) {
      $("#scrollZoomStatus").html('Off');
      repvar.pan_zoom.disableMouseWheelZoom();
    } else {
      $("#scrollZoomStatus").html('<b>On</b>');
      repvar.pan_zoom.enableMouseWheelZoom();
    }
  });
  $("#figureSvg").mousedown(function(e) {
    repvar.allow_select = true;
  }).mouseleave(function() {
    repvar.allow_select = true;
  });
}
function preventSelections(newPan) {
  repvar.allow_select = false;
}

// Node attributes creation and updates:
function newRepvarNodeObject() {
  return {'circle':null, 'label_highlight':null, 'search_highlight':null, 'node_x':null, 'node_y':null, 'label_x':null, 'label_y':null, 'tooltip':'', 'selected':false, 'node_rest_key':'node', 'node_rest_colour':repvar.opts.colours.node, 'node_mouseover_key':'cluster_highlight', 'node_mouseover_colour':repvar.opts.colours.cluster_highlight, 'label_rest_colour':'', 'label_mouseover_key':'cluster_highlight', 'label_mouseover_colour':repvar.opts.colours.cluster_highlight, 'label_selected_key':'selection', 'label_selected_colour':repvar.opts.colours.selection};
}
function changeNodeStateColour(var_name, raphael_ele, state_prefix, colour_key, new_colour=false) {
  var state_key_name = state_prefix+'_key', state_colour_name = state_prefix+'_colour';
  if (new_colour == false) { new_colour = repvar.opts.colours[colour_key]; }
  repvar.nodes[var_name][state_key_name] = colour_key;
  repvar.nodes[var_name][state_colour_name] = new_colour;
  raphael_ele.attr({fill:new_colour});
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
function clearTree() {
  if (repvar.r_paper) {
    repvar.r_paper.remove();
  }
  $("#svgCanvas").empty();
  $("#treeGroup").empty();
}
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
  var total_label_size = (maxLabelLength + tree_params.Circular.bufferOuterLabels + sizes.big_marker_radius + sizes.inner_label_buffer + sizes.bar_chart_buffer + sizes.bar_chart_height + repvar.opts.sizes.search_buffer - 1) * 2.0;

  tree_params.Circular.bufferRadius = total_label_size/canvas_size;
  tree_params.Circular.bufferInnerLabels = sizes.inner_label_buffer + sizes.big_marker_radius + 1;
  var data_object = {phyloxml: repvar.tree_data};
  var phylocanvas = new Smits.PhyloCanvas(
    data_object,
    'svgCanvas',
    canvas_size, canvas_size,
    'circular'
  );
  $("#svgCanvas > svg").attr("id", "treeSvg");
  repvar.r_paper = phylocanvas.getSvg().svg;

  drawVariantObjects();
  drawLabelAndSearchHighlights();
  drawTreeBackgrounds(maxLabelLength);

  // If adding other elements, can modify figure size here, and set the offset of the tree as well.
  $("#figureSvg").attr({'width':canvas_size, 'height':canvas_size});
  $("#treeSvg").attr({'x':0, 'y':0});
  $("#treeGroup").append($("#treeSvg")); // Move the elements from the original div to the displayed svg.
  $("#treeGroup").parent().prepend($("#treeGroup")); // Ensure this is below other elements in display stack.
}
function drawVariantObjects() {
  // Collects coordinates and angles for nodes and their names, and creates their markers and highlights.
  repvar.nodes = {};
  var text_obj, var_name, var_coords, var_marker;
  $("#treeSvg").find("text").each(function() {
    text_obj = $(this);
    var_name = text_obj.text();
    var_coords = parseLeafTextCoords(text_obj);
    var_marker = repvar.r_paper.circle(var_coords.node_x, var_coords.node_y, repvar.opts.sizes.small_marker_radius);
    var_marker.attr({fill:repvar.opts.colours.node, 'stroke-width':0.5});
    repvar.nodes[var_name] = newRepvarNodeObject();
    $.extend(repvar.nodes[var_name], {
      'circle':var_marker, 'node_x':var_coords.node_x, 'node_y':var_coords.node_y, 'label_x':var_coords.label_x, 'label_y':var_coords.label_y
    });
    addNodeLabelEventHandlers(var_name, var_marker);
  });
}
function drawLabelAndSearchHighlights() {
  var var_name, var_angle;
  var angle_offset = treeDrawingParams.scaleAngle / 2 * 1.05,
    label_highlight_start_radius = treeDrawingParams.minBGRadius+repvar.opts.sizes.big_marker_radius+1,
    label_highlight_end_radius = treeDrawingParams.barChartRadius + repvar.opts.sizes.bar_chart_buffer + repvar.opts.sizes.bar_chart_height,
    search_label_highlight_end_radius = label_highlight_end_radius + repvar.opts.sizes.search_buffer,
    marker_highlight_radius = repvar.opts.sizes.big_marker_radius * 1.5 + 1;
  for (var i=0; i<treeDrawingParams.seqs.length; ++i) {
    var_name = treeDrawingParams.seqs[i][0];
    var_angle = treeDrawingParams.seqs[i][1];
    // Sets up highlight and mouseover around sequence name:
    repvar.nodes[var_name]['label_highlight'] = drawLabelHighlight(var_name, label_highlight_start_radius, label_highlight_end_radius, var_angle-angle_offset, var_angle+angle_offset);
    // Sets up highlight around node, sequence name, and a line between them:
    repvar.nodes[var_name]['search_highlight'] = drawSearchHighlight(var_name, label_highlight_start_radius, search_label_highlight_end_radius, var_angle-angle_offset, var_angle+angle_offset, marker_highlight_radius);
  }
}
function drawLabelHighlight(var_name, start_radius, end_radius, start_angle, end_angle) {
  var label_path_str = sectorPathString(start_radius, end_radius, start_angle, end_angle),
    label_highlight = repvar.r_paper.path(label_path_str).attr({fill:repvar.opts.colours.cluster_highlight, 'stroke-width':0}).toBack().hide(),
    label_mouseover = repvar.r_paper.path(label_path_str).attr({fill:'red', 'fill-opacity':0, stroke:'none', 'stroke-width':0});
  addNodeLabelEventHandlers(var_name, label_mouseover);
  return label_highlight;
}
function drawSearchHighlight(var_name, start_radius, end_radius, start_angle, end_angle, marker_highlight_radius) {
  var node_x = repvar.nodes[var_name].node_x, node_y = repvar.nodes[var_name].node_y,
    label_x = repvar.nodes[var_name].label_x, label_y = repvar.nodes[var_name].label_y;
  var var_highlight_set = repvar.r_paper.set();
  // Highlights around the sequence name:
  var search_label_path_str = sectorPathString(start_radius, end_radius, start_angle, end_angle),
    search_label_highlight = repvar.r_paper.path(search_label_path_str);
  // Highlight around the tree node:
  var marker_highlight = repvar.r_paper.circle(node_x, node_y, marker_highlight_radius);
  // Highlight connecting the tree node and the sequence name:
  var var_line_highlight = repvar.r_paper.path('M'+node_x+','+node_y+' L'+label_x+','+label_y);
  // Grouping the highlights, and storing the object:
  var_highlight_set.push(search_label_highlight, marker_highlight, var_line_highlight);
  var_highlight_set.attr({'stroke-width':0, fill:repvar.opts.colours.search}).toBack().hide();
  var_line_highlight.attr({'stroke-width':2, stroke:repvar.opts.colours.search});
  return var_highlight_set;
}
function drawTreeBackgrounds(maxLabelLength) {
  var labels_path_str, angle_offset = treeDrawingParams.scaleAngle / 2.0,
    start_angle = treeDrawingParams.seqs[0][1] - angle_offset,
    end_angle = treeDrawingParams.seqs[treeDrawingParams.seqs.length-1][1] + angle_offset;
  if (repvar.opts.fonts.tree_font_size > 0) {
    var inside_labels_radius = treeDrawingParams.barChartRadius - maxLabelLength - Smits.PhyloCanvas.Render.Parameters.Circular.bufferOuterLabels;
    labels_path_str = sectorPathString(inside_labels_radius, treeDrawingParams.barChartRadius, start_angle, end_angle);
  } else {
    var start_pos = secPosition(treeDrawingParams.barChartRadius, start_angle);
    labels_path_str = [["M", start_pos[0], start_pos[1]], secant(treeDrawingParams.barChartRadius, start_angle, end_angle, 0)];
  }
  var labels_outline = repvar.r_paper.path(labels_path_str).attr({fill:'none', 'stroke-width':repvar.opts.sizes.labels_outline, stroke:'black'});
  repvar.tree_background = repvar.r_paper.circle(treeDrawingParams.cx, treeDrawingParams.cy, treeDrawingParams.barChartRadius).attr({fill:repvar.opts.colours.tree_background, stroke:'none', 'stroke-width':0}).toBack();
}
function drawBarGraphs() {
  var var_name, var_angle, dist, tooltip, height, path_str, bar_chart;
  var max_dist = repvar.max_variant_distance, max_height = repvar.opts.sizes.bar_chart_height,
    min_radius = treeDrawingParams.barChartRadius + repvar.opts.sizes.bar_chart_buffer,
    angle_offset = treeDrawingParams.scaleAngle / 2.0;
  for (var i=0; i<treeDrawingParams.seqs.length; ++i) {
    var_name = treeDrawingParams.seqs[i][0];
    var_angle = treeDrawingParams.seqs[i][1];
    dist = repvar.variant_distance[var_name];
    if (!(var_name in repvar.variant_distance)) {
      tooltip = '[Ignored] ' + var_name;
    } else if (dist == 0) {
      tooltip = '[Representative] ' + var_name;
    } else {
      tooltip = '['+roundFloat(dist, 4).toString()+'] ' + var_name;
      height = roundFloat(dist/max_dist * max_height, 4);
      path_str = sectorPathString(min_radius, min_radius+height,
        var_angle-angle_offset*0.9, var_angle+angle_offset*0.9);
      bar_chart = repvar.r_paper.path(path_str).attr({fill:repvar.opts.colours.bar_chart, stroke:'none', title:tooltip});
      repvar.nodes[var_name]['bar_chart'] = bar_chart;
    }
    repvar.nodes[var_name].tooltip = tooltip;
  }
}
function drawClusterObject(nodes) {
  // Adapted from http://stackoverflow.com/questions/13802203/draw-a-border-around-an-arbitrarily-positioned-set-of-shapes-with-raphaeljs
  var points_list = [];
  var var_name, x_coord, y_coord;
  for (var i=0; i<treeDrawingParams.seqs.length; ++i) {
    var_name = treeDrawingParams.seqs[i][0];
    if (nodes.indexOf(var_name) != -1) {
      x_coord = repvar.nodes[var_name].node_x;
      y_coord = repvar.nodes[var_name].node_y;
      points_list.push({'name':var_name, 'tree_index':i, 'x':x_coord, 'y':y_coord});
    }
  }
  var cluster_obj, singleton_radius = Math.max(repvar.opts.sizes.big_marker_radius, repvar.opts.sizes.cluster_expand);
  if (points_list.length == 1) {
    cluster_obj = repvar.nodes[points_list[0].name].circle.attr({'r':singleton_radius, fill:repvar.opts.colours.singleton_cluster_background});
    return [cluster_obj, false];
  }
  var hull, path_str, mouseover_obj;
  if (points_list.length == 2) {
    hull = expandHull(points_list);
  } else {
    hull = expandHull(convexHull(points_list));
  }
  path_str = bezierSplinePath(hull);
  cluster_obj = repvar.r_paper.path(path_str).attr({fill:repvar.opts.colours.cluster_background,  stroke:repvar.opts.colours.cluster_outline, 'stroke-width':0.75}).toBack();
  mouseover_obj = repvar.r_paper.path(path_str).attr({fill:'red', 'fill-opacity':0, stroke:'none', 'stroke-width':0});
  return [cluster_obj, mouseover_obj];
}

//   === Event handlers:
function addNodeLabelEventHandlers(var_name, raphael_element) {
  raphael_element.mouseover(function() {
    nodeLabelMouseoverHandler(var_name, true);
  }).mouseout(function() {
    nodeLabelMouseoutHandler(var_name, true);
  }).click(function() {
    nodeLabelMouseclickHandler(var_name);
  });
}
function nodeLabelMouseoverHandler(var_name, change_node_colour) {
  if (change_node_colour == true) {
    repvar.nodes[var_name].circle.attr({fill:repvar.nodes[var_name].node_mouseover_colour});
  }
  if (repvar.nodes[var_name].selected) {
    repvar.nodes[var_name].label_highlight.attr({fill:repvar.nodes[var_name].label_mouseover_colour});
  } else {
    repvar.nodes[var_name].label_highlight.show();
  }
}
function nodeLabelMouseoutHandler(var_name, change_node_colour) {
  if (change_node_colour == true) {
    repvar.nodes[var_name].circle.attr({fill:repvar.nodes[var_name].node_rest_colour});
  }
  if (repvar.nodes[var_name].selected) {
    repvar.nodes[var_name].label_highlight.attr({fill:repvar.nodes[var_name].label_selected_colour});
  } else if (repvar.nodes[var_name].label_rest_colour != '') {
    repvar.nodes[var_name].label_highlight.attr({fill:repvar.nodes[var_name].label_rest_colour});
  } else {
    repvar.nodes[var_name].label_highlight.hide();
  }
}
function nodeLabelMouseclickHandler(var_name, set_selection_state) {
  // If set_selection_state is not given, toggles the selection status of the node.
  if (!repvar.allow_select) { return false; }
  var cur_state = (typeof set_selection_state != "undefined") ? !set_selection_state : repvar.nodes[var_name].selected;
  if (cur_state) { // Currently true, change to false.
    delete repvar.selected[var_name];
    repvar.nodes[var_name].selected = false;
    if (repvar.nodes[var_name].label_rest_colour != '') {
      repvar.nodes[var_name].label_highlight.attr({fill:repvar.nodes[var_name].label_rest_colour});
    } else {
      repvar.nodes[var_name].label_highlight.attr({fill:repvar.nodes[var_name].label_mouseover_colour});
      repvar.nodes[var_name].label_highlight.hide();
    }
  } else { // Currently false, change to true.
    repvar.selected[var_name] = repvar.nodes[var_name].label_selected_colour;
    repvar.nodes[var_name].selected = true;
    repvar.nodes[var_name].label_highlight.attr({fill:repvar.nodes[var_name].label_selected_colour});
    repvar.nodes[var_name].label_highlight.show();
  }
}

//   === Cluster drawing functions:
function convexHull(points_list) {
  // Gift wrapping algorithm. Note that expandHull() relies on this returning in a specific order. The first node is the first of the hull found going clockwise from 12:00 on the tree, and the remaining nodes proceed clockwise around the hull (not necessarily in the clockwise order of the tree).
  var left, point;
  for (var i = 0; i < points_list.length; i++) {
    point = points_list[i];
    if (!left || point.x < left.x) {
      left = point;
    }
  }
  var hull = [left], p, q;
  for (var i = 0; i < hull.length; i++) {
    p = hull[i];
    q = nextHullPoint(points_list, p);
    if (q.x != hull[0].x || q.y != hull[0].y) {
      hull.push(q);
    }
  }
  var max_ind = 0, max_pos;
  for (var i=0; i<hull.length; ++i) {
    if (hull[i].tree_index > max_ind) {
      max_ind = hull[i].tree_index;
      max_pos = i;
    }
  }
  return hull.slice(max_pos).concat(hull.slice(0, max_pos));
}
function expandHull(hull) {
  var expand = repvar.opts.sizes.cluster_expand;
  if (hull.length == 2) {
    expand = Math.max(repvar.opts.sizes.small_marker_radius, expand, 1);
  } else if (expand == 0) {
    return hull;
  }
  var p1=hull[hull.length-1],p2=hull[0],p3, l1_len,l2_len,l_ratio,shift,scale,angle_ratio, new_p,scaled_p1,perp,extra_p1,extra_p2,
    new_hull = [];
  for (var i=0; i<hull.length; ++i) {
    // The new coords are found for p2; p1 is the previous point, p3 is the next point.
    if (i == hull.length - 1) {
      p3 = hull[0];
    } else {
      p3 = hull[i+1];
    }
    if (!l1_len) {
      l1_len = Math.sqrt(distSquared(p1, p2));
    } else {
      l1_len = l2_len;
    }
    l2_len = Math.sqrt(distSquared(p2, p3));
    l_ratio = l1_len / l2_len;
    // Calculate the transformation for p2:
    shift = {'x':(p2.x-p3.x+(p2.x-p1.x)/l_ratio)/2.0, 'y':(p2.y-p3.y+(p2.y-p1.y)/l_ratio)/2.0};
    scale = expand / Math.sqrt(distSquared(shift));
    shift.x *= scale;
    shift.y *= scale;
    new_p = {'x':p2.x+shift.x, 'y':p2.y+shift.y, 'name':p2.name, 'tree_index':p2.tree_index};
    // Check if the 2 additional points need to be added:
    scaled_p1 = {'x':(p1.x-p2.x)/l_ratio+p2.x, 'y':(p1.y-p2.y)/l_ratio+p2.y};
    angle_ratio = Math.sqrt(distSquared(scaled_p1, p3)) / l2_len;
    if (angle_ratio < 1.414214) { // If the angle between p1p2 and p2p3 is less than 90 degrees:
      perp = {'x':-shift.y, 'y':shift.x};
      new_hull.push({'x':p2.x-perp.x, 'y':p2.y-perp.y});
      new_hull.push(new_p);
      new_hull.push({'x':p2.x+perp.x, 'y':p2.y+perp.y});
    } else {
      new_hull.push(new_p);
    }
    p1 = p2;
    p2 = p3;
  }
  return new_hull;
}
function bezierSplinePath(hull) {
  // Adapted from http://www.antigrain.com/research/bezier_interpolation/ I think it's essentially equating first derivatives of adjacent curves, not but the seconds. Looks better than an implementation that equates seconds. Calculates the 2 control points for p2.
  var p1=hull[hull.length-1],p2=hull[0],p3, l1,l2,a1,a2,b,cp1,cp2, l_ratio,shift,
    scale = repvar.opts.sizes.cluster_smooth, cp_sets=[];
  for (var i=0; i<hull.length; ++i) {
    if (i == hull.length - 1) {
      p3 = hull[0];
    } else {
      p3 = hull[i+1];
    }
    if (!l1 && !a1) {
      l1 = {'x':p2.x-p1.x, 'y':p2.y-p1.y}; // Line segment between the points
      a1 = {'x':(p1.x+p2.x)/2.0, 'y':(p1.y+p2.y)/2.0}; // Midpoint of l1
    } else {
      l1 = l2;
      a1 = a2;
    }
    l2 = {'x':p3.x-p2.x, 'y':p3.y-p2.y};
    a2 = {'x':(p2.x+p3.x)/2.0, 'y':(p2.y+p3.y)/2.0};
    l_ratio = Math.sqrt(distSquared(l1)) / (Math.sqrt(distSquared(l1)) + Math.sqrt(distSquared(l2)));
    b = {'x':a1.x*(1-l_ratio) + a2.x*l_ratio, 'y':a1.y*(1-l_ratio) + a2.y*l_ratio}; // Point on the a1a2 line.
    shift = {'x':p2.x-b.x, 'y':p2.y-b.y}; // How to get from b to p2.
    cp1 = {'x':a1.x+shift.x, 'y':a1.y+shift.y}; // Transformation, so that the a1ba2 line intersects p2 at b.
    cp2 = {'x':a2.x+shift.x, 'y':a2.y+shift.y}; // These are the control points for the curve.
    if (scale != 1.0) {
      cp1 = {'x':p2.x + (cp1.x-p2.x)*scale, 'y':p2.y + (cp1.y-p2.y)*scale};
      cp2 = {'x':p2.x + (cp2.x-p2.x)*scale, 'y':p2.y + (cp2.y-p2.y)*scale};
    }
    cp_sets.push({'cp1':cp1, 'cp2':cp2});
    p1 = p2;
    p2 = p3;
  }
  var dest, path_str = "M"+hull[0].x+","+hull[0].y+" ";
  for (var i=0; i<cp_sets.length - 1; ++i) {
    dest = hull[i+1];
    cp1 = cp_sets[i].cp2;
    cp2 = cp_sets[i+1].cp1;
    path_str += "C"+cp1.x+","+cp1.y+" "+cp2.x+","+cp2.y+" "+dest.x+","+dest.y+" ";
  }
  // Draw the final closing path
  cp1 = cp_sets[cp_sets.length-1].cp2;
  cp2 = cp_sets[0].cp1;
  path_str += "C"+cp1.x+","+cp1.y+" "+cp2.x+","+cp2.y+" "+hull[0].x+","+hull[0].y+" ";
  return path_str;
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
  labelCoords = moveAwayFromCentre(labelCoords, repvar.opts.sizes.big_marker_radius+1);
  return {'node_x':parseFloat(nodeCoords[0]), 'node_y':parseFloat(nodeCoords[1]),
      'label_x':parseFloat(labelCoords[0]), 'label_y':parseFloat(labelCoords[1])};
}
function normalizeAngle(ang){
  while(ang > 360 || ang < 0) {
    if(ang > 360){ ang -= 360; }
    else if (ang < 0){ ang += 360; }
  }
  return ang;
}

// Basic drawing functions:
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
function nextHullPoint(points_list, p) {
  // Could be sped up by removing a point from points_list after it's been accepted (as long as it's not 'left')
  var q = p, r, t;
  for (var i = 0; i < points_list.length; i++) {
    r = points_list[i];
    t = turn(p, q, r);
    if (t == -1 || t == 0 && distSquared(p, r) > distSquared(p, q)) {
      q = r;
    }
  }
  return q;
}
function turn(p, q, r) {
  var x = (q.x - p.x) * (r.y - p.y) - (r.x - p.x) * (q.y - p.y);
  if (x > 0) { return 1; }
  else if (x < 0) { return -1; }
  else { return 0; }
}
function distSquared(p, q) {
  if (!q) {
    q = {'x':0.0, 'y':0.0};
  }
  var dx = q.x - p.x;
  var dy = q.y - p.y;
  return dx * dx + dy * dy;
}


// Unused functions:
function arcsPath(hull) {
  // Simple and works, but pretty jagged.
  var p1,p2, r1,r2, path_str;
  for (var i=0; i<hull.length-1; ++i) {
    p1 = hull[i];
    p2 = hull[i+1];
    r1 = Math.sqrt(distSquared(p1));
    r2 = Math.sqrt(distSquared(p2));
    if (!path_str) {
      path_str = "M"+p1.x+","+p1.y+" ";
    }
    path_str += "A"+r1+","+r2+" 0 0,1 "+p2.x+","+p2.y+" ";
  }
  return path_str;
}
function bezierSplinePath2(hull) {
  var m, a=[0], b=[2], c=[1], r=[{'x':hull[0].x+2*hull[1].x, 'y':hull[0].y+2*hull[1].y}],
    n = hull.length - 1;
  for (var i=1; i<n-1; ++i) {
    a.push(1);
    b.push(4);
    c.push(1);
    r.push({'x':4*hull[i].x+2*hull[i+1].x, 'y':4*hull[i].y+2*hull[i+1].y});
  }
  a.push(2);
  b.push(7);
  c.push(0);
  r.push({'x':8*hull[n-1].x+hull[n].x, 'y':8*hull[n-1].y+hull[n].y});

  var cp_sets = [{'cp1':{}, 'cp2':{}}];
  for (var i=1; i<n; ++i) {
    m = a[i] / b[i-1];
    b[i] = b[i] - m * c[i-1];
    r[i] = {'x':r[i].x - m * r[i-1].x, 'y':r[i].y - m * r[i-1].y};
    cp_sets.push({'cp1':{}, 'cp2':{}});
  }

  cp_sets[n-1].cp1['x'] = r[n-1].x / b[n-1];
  cp_sets[n-1].cp1['y'] = r[n-1].y / b[n-1];
  for (var i=n-2; i>=0; --i) {
    cp_sets[i].cp1['x'] = (r[i].x - c[i] * cp_sets[i+1].cp1.x) / b[i];
    cp_sets[i].cp1['y'] = (r[i].y - c[i] * cp_sets[i+1].cp1.y) / b[i];
  }
  for (var i=0; i<n-1; ++i) {
    cp_sets[i].cp2['x'] = 2*hull[i+1].x - cp_sets[i+1].cp1.x;
    cp_sets[i].cp2['y'] = 2*hull[i+1].y - cp_sets[i+1].cp1.y;
  }
  cp_sets[n-1].cp2['x'] = 0.5*(hull[n].x + cp_sets[n-1].cp1.x);
  cp_sets[n-1].cp2['y'] = 0.5*(hull[n].y + cp_sets[n-1].cp1.y);

  var cp1,cp2, path_str = "M"+hull[0].x+","+hull[0].y+" ";
  for (var i=0; i<n; ++i) {
    cp1 = cp_sets[i].cp1;
    cp2 = cp_sets[i].cp2;
    path_str += "C"+cp1.x+","+cp1.y+" "+cp2.x+","+cp2.y+" "+hull[i+1].x+","+hull[i+1].y+" ";

    repvar.r_paper.path("M"+hull[i].x+","+hull[i].y+" L"+cp1.x+","+cp1.y).attr({stroke:'black', 'stroke-width':0.25});
    repvar.r_paper.path("M"+hull[i+1].x+","+hull[i+1].y+" L"+cp2.x+","+cp2.y).attr({stroke:'black', 'stroke-width':0.25});
    repvar.r_paper.circle(cp1.x, cp1.y, 0.5).attr({fill:'purple', 'stroke-width':0});
    repvar.r_paper.circle(cp2.x, cp2.y, 0.5).attr({fill:'green', 'stroke-width':0});
  }
  return path_str;
}
