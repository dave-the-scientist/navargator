//TODO:

// =====  Tree setup functions:
function setupTreeElements() {
  $("#selectAllButton").click(function() {
    for (var i=0; i<nvrgtr_data.leaves.length; ++i) {
      nodeLabelMouseclickHandler(nvrgtr_data.leaves[i], false, true);
    }
    numSelectedCallback();
  });
  $("#clearSelectionButton").click(function() {
    // De-select selection groups
    $(".select-group-list-element").removeClass('select-group-list-element-active');
    $("#selectGroupNameInput").val('');
    // De-select any selected variatns
    nvrgtr_data.selected.forEach(function(var_name) {
      nodeLabelMouseclickHandler(var_name, false, false);
    });
    numSelectedCallback();
  });
  nvrgtr_data.pan_zoom = svgPanZoom('#figureSvg', {
    fit: false,
    center: false,
    dblClickZoomEnabled: false,
    mouseWheelZoomEnabled: false,
    zoomScaleSensitivity: 0.4, // Default is 0.2
    onPan: preventSelections
  });

  // The search input and associated buttons and labels:
  var search_input = $("#varSearchInput"), search_button = $("#varSearchButton"), search_hits_div = $("#varSearchHitsDiv"), search_select_button = $('#searchToSelectButton');
  var search_select_add_title = "Add these hits to the current selection",
    search_select_cut_title = "Remove these hits from the current selection";
  // To calculate approx center point for the search_select button:
  var tree_div_pad_str = $("#mainTreeDiv").css('paddingRight'),
    tree_div_pad = parseInt(tree_div_pad_str.slice(0,-2)),
    search_input_size = $("#treeSearchDiv")[0].scrollWidth;

  function setSearchSelectToAdd() {
    search_select_button.removeClass('tree-search-cut-hits');
    search_select_button.attr('title', search_select_add_title);
  }
  function setSearchSelectToCut() {
    search_select_button.addClass('tree-search-cut-hits');
    search_select_button.attr('title', search_select_cut_title);
  }
  function treeSearchFunction() {
    var query = search_input.val().trim().toLowerCase();
    var name, num_hits = 0;
    nvrgtr_data.search_results.length = 0;
    nvrgtr_data.search_results.add_to_selection = true; // Resets so names will be added instead of removed.
    for (var i=0; i<nvrgtr_data.leaves.length; ++i) {
      name = nvrgtr_data.leaves[i];
      if (query == '' || name.toLowerCase().indexOf(query) == -1) {
        nvrgtr_data.nodes[name]['search_highlight'].hide();
      } else {
        num_hits += 1;
        nvrgtr_data.nodes[name]['search_highlight'].show();
        nvrgtr_data.search_results.push(name);
      }
    }
    if (query == '') { // The 'clear search' command.
      search_button.removeClass('tree-search-button-clear');
      search_hits_div.css('maxWidth', '0px');
      search_hits_div.css('width', '0px');
    } else { // A real query was searched.
      $("#varSearchNumHitsText").text(num_hits + ' hits');
      var tree_div_width = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tree-width')),
        search_right_margin_str = $("#treeSearchDiv").css('right'),
        search_right_margin = parseInt(search_right_margin_str.slice(0,-2)),
        search_button_width = $("#searchToSelectButton")[0].scrollWidth + 2,
        input_right_offset = search_input_size - search_button_width/2 - tree_div_pad,
        search_select_max_width = Math.max(tree_div_width/2-input_right_offset-search_right_margin, search_button_width) + 'px';
      search_button.addClass('tree-search-button-clear');
      setSearchSelectToAdd();
      search_hits_div.css('maxWidth', search_select_max_width);
      search_hits_div.css('width', search_select_max_width);
    }
    return false;
  }
  search_button.click(function() {
    if (search_button.hasClass('tree-search-button-clear')) {
      search_input.val('');
    }
    treeSearchFunction();
  });
  search_input.on("input", function() {
    if (search_input.val() == '' && nvrgtr_data.search_results.length != 0) {
      search_button.addClass('tree-search-button-clear'); // Change to 'clear' button.
    } else {
      search_button.removeClass('tree-search-button-clear'); // Ensure is 'search' button.
    }
  }).on("keypress", function(event) {
    if (event.which == 13) { // The 'enter' key(s).
      treeSearchFunction();
    }
  });
  setSearchSelectToAdd();
  search_select_button.click(function() {
    if (nvrgtr_data.search_results.length == 0) { return false; }
    var var_name;
    if (nvrgtr_data.search_results.add_to_selection == false) { // Perform cut from selection
      setSearchSelectToAdd();
      for (var i=0; i<nvrgtr_data.search_results.length; ++i) {
        var_name = nvrgtr_data.search_results[i];
        nodeLabelMouseclickHandler(var_name, false, false);
      }
      numSelectedCallback();
      nvrgtr_data.search_results.add_to_selection = true;
    } else { // Perform add to selection
      setSearchSelectToCut();
      for (var i=0; i<nvrgtr_data.search_results.length; ++i) {
        var_name = nvrgtr_data.search_results[i];
        nodeLabelMouseclickHandler(var_name, false, true);
      }
      numSelectedCallback();
      nvrgtr_data.search_results.add_to_selection = false;
    }
  });
  // The zoom buttons:
  $('#treeZoomOutButton').click(function() {
    nvrgtr_data.pan_zoom.zoomOut();
  });
  $('#treeZoomInButton').click(function() {
    nvrgtr_data.pan_zoom.zoomIn();
  });
  $('#treeZoomResetButton').click(function() {
    nvrgtr_data.pan_zoom.resetZoom();
    nvrgtr_data.pan_zoom.resetPan();
  });
  $('#scrollZoomButton').click(function() {
    if (nvrgtr_data.pan_zoom.isMouseWheelZoomEnabled() == true) {
      $("#scrollZoomStatus").html('Off');
      nvrgtr_data.pan_zoom.disableMouseWheelZoom();
    } else {
      $("#scrollZoomStatus").html('<b>On</b>');
      nvrgtr_data.pan_zoom.enableMouseWheelZoom();
    }
  });
  // The select by name pane:
  $("#selectNamesAddButton").data('state', 'add');
  function setSelectNamesButtonToAdd() {
    $("#selectNamesAddButton").html('Add to selection');
    $("#selectNamesAddButton").data('state', 'add');
  }
  function setSelectNamesButtonToCut() {
    $("#selectNamesAddButton").html('Cut from selection');
    $("#selectNamesAddButton").data('state', 'cut');
  }
  var select_pane = $("#selectNamesPane");
  $("#selectNamesButton").click(function() {
    setSelectNamesButtonToAdd();
    showFloatingPane(select_pane);
  });
  $("#selectNamesValidateButton").click(function() {
    validateSelectNamesFromText();
    setSelectNamesButtonToAdd();
  });
  $("#selectNamesClearButton").click(function() {
    $("#selectNamesText").val('');
    setSelectNamesButtonToAdd();
  });
  $("#selectNamesAddButton").click(function() {
    var names = validateSelectNamesFromText();
    if (names.length == 0) {
      return false;
    }
    if ($(this).data('state') == 'add') {
      for (var i=0; i<names.length; ++i) {
        nodeLabelMouseclickHandler(names[i], false, true);
      }
      setSelectNamesButtonToCut();
    } else {
      for (var i=0; i<names.length; ++i) {
        nodeLabelMouseclickHandler(names[i], false, false);
      }
      setSelectNamesButtonToAdd();
    }
    numSelectedCallback();
  });
  // Prevent selection on pan:
  $("#figureSvg").mousedown(function(e) {
    nvrgtr_data.allow_select = true;
  }).mouseleave(function() {
    nvrgtr_data.allow_select = true;
  });
}
function validateSelectNamesFromText() {
  var raw_names = getSelectNamesFromText(),
    names = [], not_found = [], name, true_name;
  for (var i=0; i<raw_names.length; ++i) {
    name = raw_names[i];
    true_name = nvrgtr_data.lc_leaves[name.toLowerCase()];
    if (true_name) {
      names.push(true_name);
    } else {
      not_found.push(name);
    }
  }
  if (not_found.length > 0) {
    var message = not_found.length+' variant names were not found in the current tree and have been removed:\n';
    message += not_found.join(', ');
    showErrorPopup(message, 'NaVARgator warning');
  }
  $("#selectNamesText").val(names.join(', '));
  return names;
}
function getSelectNamesFromText() {
  var names = [], raw_str = $.trim($("#selectNamesText").val());
  if (raw_str != '') {
    names = raw_str.split(/[\s,]+/); // Split on one or more of a comma or whitespace character.
  }
  return names;
}
function preventSelections(newPan) {
  nvrgtr_data.allow_select = false;
}

// Node attributes creation and updates:
function newNodeObject() {
  return {'circle':null, 'text':null, 'label_highlight':null, 'label_mouseover':null, 'search_highlight':null, 'node_x':null, 'node_y':null, 'label_x':null, 'label_y':null, 'tooltip':'', 'mouseover':false, 'selected':false, 'node_rest_key':'default_node', 'node_rest_colour':nvrgtr_display_opts.colours.default_node, 'node_mouseover_key':'cluster_highlight', 'node_mouseover_colour':nvrgtr_display_opts.colours.cluster_highlight, 'node_selected_key':'selection', 'node_selected_colour':nvrgtr_display_opts.colours.selection, 'label_rest_colour':nvrgtr_display_opts.colours.label_bg, 'label_mouseover_key':'cluster_highlight', 'label_mouseover_colour':nvrgtr_display_opts.colours.cluster_highlight, 'label_selected_key':'selection', 'label_selected_colour':nvrgtr_display_opts.colours.selection, 'banners':[]};
}
function changeNodeStateColour(var_name, raphael_ele, state_prefix, colour_key, do_fill=true) {
  var state_key_name = state_prefix+'_key', state_colour_name = state_prefix+'_colour',
    new_colour = nvrgtr_display_opts.colours[colour_key];
  nvrgtr_data.nodes[var_name][state_key_name] = colour_key;
  nvrgtr_data.nodes[var_name][state_colour_name] = new_colour;
  if (do_fill == true) {
    raphael_ele.attr({fill:new_colour});
  }
}

function changeSelectionGroupNodeColour(node, new_colour) {
  // If new_colour is null it isn't changed, if false it is reset
  if (new_colour == null) {
    return false;
  } else if (new_colour == false) { // Reset the node
    new_colour = nvrgtr_display_opts.colours[node.node_rest_key];
  }
  node.node_rest_colour = new_colour;
  node.circle.attr({fill:new_colour});
}
function changeSelectionGroupNodeSize(node, radius) {
  // If radius is null it isn't changed, if false it is reset
  if (radius == null) {
    return false;
  } else if (radius == false) { // Reset the node
    if (node.node_rest_key == 'default_node') {
      radius = nvrgtr_display_opts.sizes.small_marker_radius;
    } else {
      radius = nvrgtr_display_opts.sizes.big_marker_radius;
    }
  }
  node.circle.attr({'r':radius});
}
function changeSelectionGroupLabelColour(node, new_colour) {
  // If new_colour is null it isn't changed, if false it is reset
  if (new_colour == null) {
    return false;
  } else if (new_colour == false) { // Reset the node
    node.label_rest_colour = '';
    if (node.selected == true) {
      new_colour = nvrgtr_display_opts.colours[node.label_selected_key];
    } else {
      new_colour = node.label_mouseover_colour; // Happens whether node.mouseover or not
      if (node.mouseover == true) {
        node.label_highlight.hide();
      }
    }
  } else {
    node.label_rest_colour = new_colour;
    node.label_highlight.show();
  }
  node.label_highlight.attr({fill:new_colour});
  if (nvrgtr_page.page == 'input') {
    node.variant_select_label.css('background', new_colour);
  }
}
function changeSelectionGroupTextColour(node, new_colour) {
  // If new_colour is null it isn't changed, if false it is reset
  if (new_colour == null) {
    return false;
  } else if (new_colour == false) { // Reset the node
    new_colour = nvrgtr_display_opts.colours.label_text;
  }
  node.text.attr({fill:new_colour});
  if (nvrgtr_page.page == 'input') {
    node.variant_select_label.css('color', new_colour);
  }
}
function changeSelectionGroupBannerColours(node, colours) {
  // If a colour is null it isn't changed.
  var col;
  for (let i=0; i<node.banners.length; ++i) {
    col = colours[i];
    if (col != null) {
      node.banners[i].attr({fill:col});
    }
  }
}

// =====  Tree drawing functions:
function clearTree() {
  if (nvrgtr_data.r_paper) {
    nvrgtr_data.r_paper.remove(); // Don't use .clear() here.
    nvrgtr_data.r_paper = null;
  }
  if (nvrgtr_data.banner_legend_paper) {
    nvrgtr_data.banner_legend_paper.remove();
    nvrgtr_data.banner_legend_paper = null;
    $("#treeBannerLegendGroup").hide();
  }
  $("#svgCanvas").empty();
  $("#treeGroup").empty();
  //$("#treeBannerLegendGroup").empty();
}
function drawTree(marker_tooltips=true) {
  // Assumes that clearTree() has already been called.
  // Assumes the "Loading..." message has already been shown: $("#treeLoadingMessageGroup").show()

  loadPhyloSVG(); // Reloads jsPhyloSVG.
  var tree_params = Smits.PhyloCanvas.Render.Parameters,
    tree_style = Smits.PhyloCanvas.Render.Style,
    sizes = nvrgtr_display_opts.sizes;

  tree_params.jsOverride = 1;
  tree_style.text["font-size"] = nvrgtr_display_opts.fonts.tree_font_size;
  tree_style.text["font-family"] = nvrgtr_display_opts.fonts.family;
  tree_style.connectedDash['stroke'] = 'none';
  treeDrawingParams['initStartAngle'] = nvrgtr_display_opts.angles.init_angle;
  treeDrawingParams['bufferAngle'] = nvrgtr_display_opts.angles.buffer_angle;

  var canvas_size = sizes.tree,
    maxLabelLength = getMaxLabelLength(nvrgtr_data.leaves),
    total_label_size = maxLabelLength + tree_params.Circular.bufferOuterLabels + sizes.big_marker_radius + sizes.inner_label_buffer + sizes.search_buffer - 1;
  if (nvrgtr_page.page == 'results' && sizes.bar_chart_height != 0) { // If a bar chart is going to be drawn:
    total_label_size += sizes.bar_chart_buffer + sizes.bar_chart_height;
  }
  // Modify total_label_size if any banners are to be drawn
  if (nvrgtr_display_opts.labels.banner_names.length > 0) {
    total_label_size += nvrgtr_display_opts.labels.banner_names.length * nvrgtr_display_opts.sizes.banner_height;
    total_label_size += (nvrgtr_display_opts.labels.banner_names.length-1) * nvrgtr_display_opts.sizes.banner_buffer;
  }
  total_label_size *= 2.0; // Convert from radius to diameter

  if (total_label_size >= canvas_size) {
    let new_size = Math.ceil(total_label_size) + 1;
    sizes.tree = new_size;
    canvas_size = new_size;
    $("#displayTreeWidthSpinner").spinner('value', new_size);
    showErrorPopup("Error: tree width too small to accomodate the desired features. It has been set to "+new_size);
  }

  nvrgtr_data.max_root_pixels = (canvas_size - total_label_size) / 2.0; // distance from the root to the furthest drawn node
  tree_params.Circular.bufferRadius = total_label_size/canvas_size;
  tree_params.Circular.bufferInnerLabels = sizes.inner_label_buffer + sizes.big_marker_radius + 1;
  var data_object = {phyloxml: nvrgtr_data.tree_data};
  var phylocanvas = new Smits.PhyloCanvas(
    data_object,
    'svgCanvas',
    canvas_size, canvas_size,
    'circular'
  );
  $("#svgCanvas > svg").attr("id", "treeSvg");
  nvrgtr_data.r_paper = phylocanvas.getSvg().svg;

  drawVariantObjects(marker_tooltips);
  drawTreeBanners(); // Should be called before drawLabelAndSearchHighlights() so banners are behind the label mouseover.
  drawLabelAndSearchHighlights();
  drawTreeBackgrounds(maxLabelLength);
  // Adjust the div holding the tree:
  let tree_div_width = Math.max(canvas_size, nvrgtr_page.min_tree_div_width);
  document.documentElement.style.setProperty('--tree-width', tree_div_width + 'px');
  // Finalize the SVGs:
  let [canvas_height, y_offset] = calculateTreeCanvasHeight(canvas_size);
  nvrgtr_data.figure_svg_height = canvas_height;
  let x_offset = Math.max((nvrgtr_page.min_tree_div_width-canvas_size)/2, 0); // Ensures it's centered
  $("#treeSvg").attr({'x':x_offset, 'y':y_offset});
  $("#figureSvg").attr({'width':canvas_size, 'height':canvas_height});
  $("#treeGroup").append($("#treeSvg")); // Move the elements from the original div to the displayed svg.
  $("#treeGroup").parent().prepend($("#treeGroup")); // Ensure this is below other elements in display stack.

  // Update & show legends and scale bar
  let banner_legend_y_trans = canvas_height + nvrgtr_settings.banner_legend.bl_top_margin;
  $("#treeBannerLegendGroup").attr('transform', 'translate(0,'+banner_legend_y_trans+')');
  if (nvrgtr_display_opts.labels.show_banners_legend == true) {
    drawBannerLegend();
  } else {
    $("#showBannerLegendCheckbox").prop('disabled', true).prop('checked', true);
  }

  updateTreeLegend(); // Must be called after setting figureSvg height.
  if (nvrgtr_display_opts.labels.show_legend == true) {
    $("#treeLegendLeftGroup").show();
    $("#showLegendCheckbox").prop('checked', true);
  } else {
    $("#treeLegendLeftGroup").hide();
    $("#showLegendCheckbox").prop('checked', false);
  }
  updateScaleBar(sizes.scale_bar_distance);
  if (nvrgtr_display_opts.labels.show_scalebar == true) {
    $("#treeScaleBarGroup").show();
    $("#showScaleBarCheckbox").prop('checked', true);
  } else {
    $("#treeScaleBarGroup").hide();
    $("#showScaleBarCheckbox").prop('checked', false);
  }

  $("#treeLoadingMessageGroup").hide(); // Hides the "Loading..." message
}
function drawVariantObjects(marker_tooltips) {
  // Collects coordinates and angles for nodes and their names, and creates their markers and highlights.
  nvrgtr_data.nodes = {};
  var text_obj, var_name, var_coords, var_marker;
  $("#treeSvg").find("text").each(function() {
    text_obj = $(this);
    text_obj.attr({fill:nvrgtr_display_opts.colours.label_text});
    var_name = text_obj.text();
    var_coords = parseLeafTextCoords(text_obj);
    var_marker = nvrgtr_data.r_paper.circle(var_coords.node_x, var_coords.node_y, nvrgtr_display_opts.sizes.small_marker_radius);
    var_marker.attr({fill:nvrgtr_display_opts.colours.default_node, 'stroke-width':0.5});
    if (marker_tooltips == true) {
      var_marker.attr({title: var_name});
    }
    nvrgtr_data.nodes[var_name] = newNodeObject();
    $.extend(nvrgtr_data.nodes[var_name], {
      'circle':var_marker, 'node_x':var_coords.node_x, 'node_y':var_coords.node_y, 'label_x':var_coords.label_x, 'label_y':var_coords.label_y, 'text':text_obj
    });
    addNodeLabelEventHandlers(var_name, var_marker);
  });
}
function drawLabelAndSearchHighlights() {
  var var_name, var_angle, sizes = nvrgtr_display_opts.sizes;
  var angle_offset = treeDrawingParams.scaleAngle / 2 * 1.05,
    label_highlight_start_radius = treeDrawingParams.minBGRadius+sizes.big_marker_radius+1,
    label_highlight_end_radius = treeDrawingParams.barChartRadius;
  if (nvrgtr_page.page == 'results' && sizes.bar_chart_height != 0) { // Make room for the bar chart.
    label_highlight_end_radius += sizes.bar_chart_buffer + sizes.bar_chart_height;
  }
  // Modify total_label_size if any banners are to be drawn
  if (nvrgtr_display_opts.labels.banner_names.length > 0) {
    label_highlight_end_radius += nvrgtr_display_opts.labels.banner_names.length * nvrgtr_display_opts.sizes.banner_height;
    label_highlight_end_radius += (nvrgtr_display_opts.labels.banner_names.length-1) * nvrgtr_display_opts.sizes.banner_buffer;
  }
  var search_label_highlight_end_radius = label_highlight_end_radius + sizes.search_buffer,
    marker_highlight_radius = sizes.big_marker_radius * 1.5 + 1;
  for (var i=0; i<treeDrawingParams.seqs.length; ++i) {
    var_name = treeDrawingParams.seqs[i][0];
    var_angle = treeDrawingParams.seqs[i][1];
    // Sets up highlight and mouseover around sequence name:
    drawLabelHighlight(var_name, label_highlight_start_radius, label_highlight_end_radius, var_angle-angle_offset, var_angle+angle_offset);
    // Sets up highlight around node, sequence name, and a line between them:
    drawSearchHighlight(var_name, label_highlight_start_radius, search_label_highlight_end_radius, var_angle-angle_offset, var_angle+angle_offset, marker_highlight_radius);
  }
}
function drawLabelHighlight(var_name, start_radius, end_radius, start_angle, end_angle) {
  var label_path_str = sectorPathString(start_radius, end_radius, start_angle, end_angle),
    label_highlight = nvrgtr_data.r_paper.path(label_path_str).attr({fill:nvrgtr_display_opts.colours.label_bg, 'stroke-width':0}).toBack(),
    label_mouseover = nvrgtr_data.r_paper.path(label_path_str).attr({fill:'red', 'fill-opacity':0, stroke:'none', 'stroke-width':0});
  addNodeLabelEventHandlers(var_name, label_mouseover);
  nvrgtr_data.nodes[var_name].label_highlight = label_highlight;
  nvrgtr_data.nodes[var_name].label_mouseover = label_mouseover;
}
function drawSearchHighlight(var_name, start_radius, end_radius, start_angle, end_angle, marker_highlight_radius) {
  var node_x = nvrgtr_data.nodes[var_name].node_x, node_y = nvrgtr_data.nodes[var_name].node_y,
    label_x = nvrgtr_data.nodes[var_name].label_x, label_y = nvrgtr_data.nodes[var_name].label_y;
  var var_highlight_set = nvrgtr_data.r_paper.set();
  // Highlights around the sequence name:
  var search_label_path_str = sectorPathString(start_radius, end_radius, start_angle, end_angle),
    search_label_highlight = nvrgtr_data.r_paper.path(search_label_path_str);
  // Highlight around the tree node:
  var marker_highlight = nvrgtr_data.r_paper.circle(node_x, node_y, marker_highlight_radius);
  // Highlight connecting the tree node and the sequence name:
  var var_line_highlight = nvrgtr_data.r_paper.path('M'+node_x+','+node_y+' L'+label_x+','+label_y);
  // Grouping the highlights, and storing the object:
  var_highlight_set.push(search_label_highlight, marker_highlight, var_line_highlight);
  var_highlight_set.attr({'stroke-width':0, fill:nvrgtr_display_opts.colours.search}).toBack().hide();
  var_line_highlight.attr({'stroke-width':2, stroke:nvrgtr_display_opts.colours.search});
  nvrgtr_data.nodes[var_name].search_highlight = var_highlight_set;
}
function drawTreeBanners() {
  var banner_sep = 0.2, banner_label_buff = 5;
  nvrgtr_data.banner_labels.forEach(function(label_ele) {
    label_ele.remove();
  });
  nvrgtr_data.banner_labels = [];
  var total_banner_size = nvrgtr_display_opts.sizes.banner_height + nvrgtr_display_opts.sizes.banner_buffer,
    angle_offset = treeDrawingParams.scaleAngle / 2 * 1.05;
  var rad_start, rad_end, var_name, var_angle, banner_path_str, banner_obj, label_coords, label_obj,
    init_rad_start = treeDrawingParams.barChartRadius;
  for (let i=0; i<nvrgtr_display_opts.labels.banner_names.length; ++i) {
    // For each banner:
    rad_start = init_rad_start + i*total_banner_size;
    rad_end = rad_start + nvrgtr_display_opts.sizes.banner_height;
    // Draw banners:
    for (let j=0; j<treeDrawingParams.seqs.length; ++j) {
      var_name = treeDrawingParams.seqs[j][0];
      var_angle = treeDrawingParams.seqs[j][1];
      banner_path_str = sectorPathString(rad_start, rad_end, var_angle-angle_offset, var_angle+angle_offset);
      banner_obj = nvrgtr_data.r_paper.path(banner_path_str).attr({fill:'white', stroke:'black', 'stroke-width':banner_sep});
      nvrgtr_data.nodes[var_name].banners.push(banner_obj);
    }
    // Draw banner labels:
    label_coords = secPosition((rad_start + rad_end) / 2, var_angle + angle_offset);
    label_coords[0] -= banner_label_buff;
    label_obj = nvrgtr_data.r_paper.text(label_coords[0], label_coords[1], nvrgtr_display_opts.labels.banner_names[i]);
    label_obj.attr({'font-size': nvrgtr_display_opts.fonts.banner_font_size, 'text-anchor':'end', 'font-weight':'bold', 'font-family':nvrgtr_display_opts.fonts.family});
    $(label_obj.node).css('user-select', 'none');
    if (nvrgtr_display_opts.labels.show_banners == false) {
      label_obj.hide();
    }
    nvrgtr_data.banner_labels.push(label_obj);
  }
}
function drawTreeBackgrounds(maxLabelLength) {
  var labels_path_str = null, angle_offset = treeDrawingParams.scaleAngle / 2.0,
    start_angle = treeDrawingParams.seqs[0][1] - angle_offset,
    end_angle = treeDrawingParams.seqs[treeDrawingParams.seqs.length-1][1] + angle_offset,
    inside_labels_radius = treeDrawingParams.barChartRadius - maxLabelLength;
  if (nvrgtr_display_opts.fonts.tree_font_size > 0) {
    inside_labels_radius -= Smits.PhyloCanvas.Render.Parameters.Circular.bufferOuterLabels;
  }
  // Decide what to draw around the tree labels
  if (nvrgtr_page.page == 'input' && nvrgtr_display_opts.fonts.tree_font_size > 0 ||
      nvrgtr_page.page == 'results' && nvrgtr_display_opts.fonts.tree_font_size == 0) {
    // Only draw inner arc, between labels and nodes.
    var start_pos = secPosition(inside_labels_radius, start_angle);
    labels_path_str = [["M", start_pos[0], start_pos[1]], secant(inside_labels_radius, start_angle, end_angle, 0)];
  } else if (nvrgtr_page.page == 'results' && nvrgtr_display_opts.fonts.tree_font_size > 0) {
    // Draw inner and outer arc, connected together, around labels.
    labels_path_str = sectorPathString(inside_labels_radius, treeDrawingParams.barChartRadius, start_angle, end_angle);
  }
  if (labels_path_str != null && nvrgtr_display_opts.sizes.labels_outline > 0) {
    nvrgtr_data.r_paper.path(labels_path_str).attr({fill:'none', 'stroke-width':nvrgtr_display_opts.sizes.labels_outline, stroke:'black'}); // No reference to the element is saved. Should be fine.
  }
  // Draw filled-in circle to go behind tree.
  nvrgtr_data.tree_background = nvrgtr_data.r_paper.circle(treeDrawingParams.cx, treeDrawingParams.cy, treeDrawingParams.barChartRadius).attr({fill:nvrgtr_display_opts.colours.tree_background, stroke:'none', 'stroke-width':0}).toBack();
}
function updateTreeLegend() {
  $("#legendAvailMarker").attr({fill: nvrgtr_display_opts.colours.available});
  $("#legendChosenMarker").attr({fill: nvrgtr_display_opts.colours.chosen});
  $("#legendIgnoredMarker").attr({fill: nvrgtr_display_opts.colours.ignored});
  if ($("#legendSingletonMarker").length) {
    $("#legendSingletonMarker").attr({fill: nvrgtr_display_opts.colours.singleton_cluster_background});
  }
  let border_height = parseFloat($("#legendBorderRect").attr('height')),
    legend_offset = nvrgtr_data.figure_svg_height - border_height - 1;
  if (!isNaN(legend_offset)) {
    $("#treeLegendLeftGroup").attr('transform', 'translate(0,'+legend_offset+')');
  }
}
function updateScaleBar(bar_dist) {
  let max_root_px = nvrgtr_data.max_root_pixels,
    px_scale_factor = nvrgtr_data.max_root_distance / max_root_px, bar_px;
  if (isNaN(bar_dist) || bar_dist <= 0) {
    // Find an appropriate scale bar size if a valid size was not given:
    let min_pix = 100, max_pix = 200; // Default scale bar size range
    bar_dist = findNiceNumber(min_pix*px_scale_factor, max_pix*px_scale_factor);
  }
  bar_px = bar_dist / px_scale_factor;
  nvrgtr_display_opts.sizes.scale_bar_distance = bar_dist;
  // Reconfigure the scale bar to that size:
  let bar_text_dist = 7, bar_buffer = 3;
  // bar_xoffset accounts for when the tree is smaller than the div holding it
  let tree_width = parseFloat($("#figureSvg").attr('width')),
    bar_xoffset = Math.max(tree_width, nvrgtr_page.min_tree_div_width)/2 + tree_width/2 - bar_px - bar_buffer,
    bar_yoffset = nvrgtr_data.figure_svg_height - bar_text_dist - bar_buffer;
  // Check to ensure bar_px isn't too wide for the current tree (figuresvg width - legend width). If it is, throw error popup, return '', set $("#scaleBarInput") to ''.
  if (!isNaN(bar_xoffset) && !isNaN(bar_yoffset)) {
    $("#treeScaleBarText").text(bar_dist);
    $("#treeScaleBarText").attr('x', bar_xoffset + bar_px/2.0);
    $("#treeScaleBar").attr({'x1':bar_xoffset, 'x2':bar_xoffset+bar_px});
    $("#treeScaleBarGroup").attr('transform', 'translate(0,'+bar_yoffset+')');
    $("#scaleBarInput").val(bar_dist);
  }
  return bar_dist;
}

function findNiceNumber(min_num, max_num) {
  // Convert numbers to strings and then arrays
  var min_arr = min_num.toString().split(''), max_arr = max_num.toString().split('');
  var min_dec = min_arr.indexOf('.'), max_dec = max_arr.indexOf('.');
  // Ensure both numbers are floats, not integers
  if (min_dec == -1) {
    min_dec = min_arr.length;
    min_arr.push('.');
    min_arr.push('0')
  }
  if (max_dec == -1) {
    max_dec = max_arr.length;
    max_arr.push('.');
    max_arr.push('0')
  }
  // Find a nice value between the numbers
  var nice_arr = [], nice_num, new_num;
  if (min_dec == max_dec) { // If decimals are in the same place:
    for (var i=0; i<Math.min(min_arr.length, max_arr.length); ++i) {
      if (min_arr[i] == max_arr[i]) {
        nice_arr.push(min_arr[i]);
      } else {
        new_num = Math.ceil((parseFloat(min_arr[i]) + parseFloat(max_arr[i])) / 2.0).toString();
        nice_arr.push(new_num);
        break;
      }
    }
    nice_num = parseFloat(nice_arr.join(''));
  } else { // The integers are very different, so can discard the decimal information:
    new_num = parseFloat(min_arr.slice(0,min_dec).join('')) + parseFloat(max_arr.slice(0,max_dec).join(''));
    nice_num = Math.ceil(new_num / 2.0);
  }
  return nice_num;
}

function calculateTreeCanvasHeight(canvas_size) {
  let radius = canvas_size / 2.0;
  // Calculates if there is an overlap between the control buttons and the tree
  let top_overlap, control_width = $("#treeControlsDiv")[0].scrollWidth,
    control_height = $("#treeControlsDiv")[0].scrollHeight - 15,
    split_width = Math.max(canvas_size, nvrgtr_page.min_tree_div_width)/2 - control_width;
  if (split_width >= radius) {
    top_overlap = 0;
  } else {
    let cleared_height = radius - Math.sqrt(radius*radius - split_width*split_width);
    top_overlap = Math.max(control_height - cleared_height, 0);
  }
  // Calculates if there is an overlap between the legend and the tree
  let legend_overlap, legend_width = parseFloat($("#legendBorderRect").attr('width')),
    legend_height = parseFloat($("#legendBorderRect").attr('height')),
    legend_split = Math.max(canvas_size, nvrgtr_page.min_tree_div_width)/2 - legend_width;
  if (legend_split >= radius) {
    legend_overlap = 0;
  } else {
    let allowed_height = radius - Math.sqrt(radius*radius - legend_split*legend_split);
    legend_overlap = Math.max(legend_height - allowed_height, 0);
  }
  return [canvas_size + top_overlap + legend_overlap, top_overlap];
}
function drawBarGraphs() {
  var var_name, var_angle, dist, tooltip, path_str, bar_chart,
    graph_min_radius = treeDrawingParams.barChartRadius + nvrgtr_display_opts.sizes.bar_chart_buffer;
  // Modify total_label_size if any banners are to be drawn
  if (nvrgtr_display_opts.labels.banner_names.length > 0) {
    graph_min_radius += nvrgtr_display_opts.labels.banner_names.length * nvrgtr_display_opts.sizes.banner_height;
    graph_min_radius += (nvrgtr_display_opts.labels.banner_names.length-1) * nvrgtr_display_opts.sizes.banner_buffer;
  }
  for (var i=0; i<treeDrawingParams.seqs.length; ++i) {
    var_name = treeDrawingParams.seqs[i][0];
    var_angle = treeDrawingParams.seqs[i][1];
    dist = nvrgtr_data.variant_distance[var_name];
    if (!(var_name in nvrgtr_data.variant_distance)) {
      tooltip = '[Ignored] ' + var_name;
    } else if (dist == 0) {
      tooltip = '[Chosen] ' + var_name;
    } else {
      tooltip = '['+roundFloat(dist, 4).toString()+'] ' + var_name;
      path_str = getBarGraphPathStr(var_name, var_angle, dist, graph_min_radius);
      bar_chart = nvrgtr_data.r_paper.path(path_str).attr({fill:nvrgtr_display_opts.colours.bar_chart, stroke:'none'});
      bar_chart.insertAfter(nvrgtr_data.nodes[var_name].label_highlight);
      nvrgtr_data.nodes[var_name]['bar_chart'] = bar_chart;
    }
    nvrgtr_data.nodes[var_name].tooltip = tooltip;
  }
}
function getBarGraphPathStr(var_name, var_angle, dist, min_radius) {
  var angle_offset = treeDrawingParams.scaleAngle / 2.0;
  var height_scale = Math.min(dist/nvrgtr_data.normalized_max_distance, 1.0);
  var height = roundFloat(height_scale*nvrgtr_display_opts.sizes.bar_chart_height, 4);
  return sectorPathString(min_radius, min_radius+height,
    var_angle-angle_offset*0.9, var_angle+angle_offset*0.9);
}
function drawClusterObject(nodes) {
  // Adapted from http://stackoverflow.com/questions/13802203/draw-a-border-around-an-arbitrarily-positioned-set-of-shapes-with-raphaeljs
  var points_list = [];
  var var_name, x_coord, y_coord;
  for (var i=0; i<treeDrawingParams.seqs.length; ++i) {
    var_name = treeDrawingParams.seqs[i][0];
    if (nodes.indexOf(var_name) != -1) {
      x_coord = nvrgtr_data.nodes[var_name].node_x;
      y_coord = nvrgtr_data.nodes[var_name].node_y;
      points_list.push({'name':var_name, 'tree_index':i, 'x':x_coord, 'y':y_coord});
    }
  }
  var cluster_obj, singleton_radius = Math.max(nvrgtr_display_opts.sizes.big_marker_radius, nvrgtr_display_opts.sizes.cluster_expand);
  if (points_list.length == 1) {
    cluster_obj = nvrgtr_data.nodes[points_list[0].name].circle.attr({'r':singleton_radius, fill:nvrgtr_display_opts.colours.singleton_cluster_background});
    return [cluster_obj, false];
  }
  var hull, path_str, mouseover_obj;
  if (points_list.length == 2) {
    hull = expandHull(points_list);
  } else {
    hull = expandHull(convexHull(points_list));
  }
  path_str = bezierSplinePath(hull);
  cluster_obj = nvrgtr_data.r_paper.path(path_str).attr({fill:nvrgtr_display_opts.colours.cluster_background_trans, 'fill-opacity':nvrgtr_display_opts.colours.cluster_opacity, stroke:nvrgtr_display_opts.colours.cluster_outline, 'stroke-width':0.75}).toBack();
  mouseover_obj = nvrgtr_data.r_paper.path(path_str).attr({fill:'red', 'fill-opacity':0, stroke:'none', 'stroke-width':0});
  return [cluster_obj, mouseover_obj];
}

//   === Event handlers:
function addNodeLabelEventHandlers(var_name, raphael_element) {
  // Also handles shift-clicking to (de)select a range of variants.
  raphael_element.mouseover(function() {
    nodeLabelMouseoverHandler(var_name);
  }).mouseout(function() {
    nodeLabelMouseoutHandler(var_name);
  }).click(function(event) {
    if (event.shiftKey) {
      if (nvrgtr_data.last_selected == null || nvrgtr_data.selected.size == 0) {
        return;
      }
      let last_ind = nvrgtr_data.ordered_names.indexOf(nvrgtr_data.last_selected), cur_ind = nvrgtr_data.ordered_names.indexOf(var_name);
      for (let i=Math.min(last_ind, cur_ind); i<=Math.max(last_ind, cur_ind); i++) {
        nodeLabelMouseclickHandler(nvrgtr_data.ordered_names[i], false, nvrgtr_data.last_was_select);
      }
      numSelectedCallback();
    } else {
      nodeLabelMouseclickHandler(var_name);
      nvrgtr_data.last_selected = var_name;
      if (nvrgtr_data.nodes[var_name].selected == true) {
        nvrgtr_data.last_was_select = true;
      } else {
        nvrgtr_data.last_was_select = false;
      }
    }
  });
}
function nodeLabelMouseoverHandler(var_name, change_node_colour=true) {
  var node = nvrgtr_data.nodes[var_name], label_colour = node.label_mouseover_colour;
  node.mouseover = true;
  node.label_highlight.attr({fill:label_colour});
  if (node.selected == false) {
    node.label_highlight.show();
  }
  if (change_node_colour == true) {
    node.circle.attr({fill:node.node_mouseover_colour});
  }
  nodeLabelMouseoverHandlerCallback(var_name, label_colour);
}
function nodeLabelMouseoutHandler(var_name, change_node_colour=true) {
  if (nvrgtr_data.considered_variants[var_name] != undefined) { return false; }
  var node = nvrgtr_data.nodes[var_name], circle_colour = node.node_rest_colour, label_colour = '';
  node.mouseover = false;
  if (node.selected) {
    circle_colour = node.node_selected_colour;
    label_colour = node.label_selected_colour;
    node.label_highlight.attr({fill:label_colour});
  } else if (node.label_rest_colour != '') {
    label_colour = node.label_rest_colour;
    node.label_highlight.attr({fill:label_colour});
  } else {
    node.label_highlight.hide();
  }
  if (change_node_colour == true) {
    node.circle.attr({fill:circle_colour});
  }
  nodeLabelMouseoutHandlerCallback(var_name, label_colour);
}
function nodeLabelMouseclickHandler(var_name, call_num_selected=true, set_selection_state) {
  // If set_selection_state is not given, toggles the selection status of the node.
  if (!nvrgtr_data.allow_select) { return false; } // Prevents selection when panning tree.
  var node = nvrgtr_data.nodes[var_name],
    cur_state = (typeof set_selection_state != "undefined") ? !set_selection_state : node.selected,
    label_colour = node.label_selected_colour;
  if (cur_state) { // Currently true, change to false.
    if (node.selected) { nvrgtr_data.num_selected -= 1; }
    nvrgtr_data.selected.delete(var_name);
    node.selected = false;
    if (node.mouseover == false) {
      node.circle.attr({fill:node.node_rest_colour});
      if (node.label_rest_colour != '') {
        label_colour = node.label_rest_colour;
        node.label_highlight.attr({fill:label_colour});
      } else {
        label_colour = '';
        node.label_highlight.hide();
        node.label_highlight.attr({fill:node.label_mouseover_colour});
      }
    } else {
      label_colour = node.label_mouseover_colour;
      node.label_highlight.attr({fill:label_colour});
      nodeLabelMouseoverHandler(var_name);
    }
  } else { // Currently false, change to true.
    if (!node.selected) { nvrgtr_data.num_selected += 1; }
    nvrgtr_data.selected.add(var_name);
    node.selected = true;
    node.circle.attr({fill:node.node_selected_colour});
    node.label_highlight.attr({fill:label_colour});
    node.label_highlight.show();
  }
  if (call_num_selected == true) {
    numSelectedCallback();
  }
  nodeLabelMouseclickHandlerCallback(var_name, label_colour);
}
function nodeLabelMouseoverHandlerCallback(var_name, label_colour) { /* Overwrite if desired */ }
function nodeLabelMouseoutHandlerCallback(var_name, label_colour) { /* Overwrite if desired */ }
function nodeLabelMouseclickHandlerCallback(var_name, label_colour) { /* Overwrite if desired */ }
function numSelectedCallback() { /* Overwrite if desired */ }

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
  var expand = nvrgtr_display_opts.sizes.cluster_expand;
  if (hull.length == 2) {
    expand = Math.max(nvrgtr_display_opts.sizes.small_marker_radius, expand, 1);
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
    scale = nvrgtr_display_opts.sizes.cluster_smooth, cp_sets=[];
  for (var i=0; i<hull.length; ++i) {
    if (i == hull.length - 1) {
      p3 = hull[0];
    } else {
      p3 = hull[i+1];
    }
    if (!l1 && !a1) {
      l1 = {'x':p2.x-p1.x, 'y':p2.y-p1.y}; // Line segment between points p1 and p2
      a1 = {'x':(p1.x+p2.x)/2.0, 'y':(p1.y+p2.y)/2.0}; // Midpoint of l1
    } else {
      l1 = l2;
      a1 = a2;
    }
    l2 = {'x':p3.x-p2.x, 'y':p3.y-p2.y}; // Line segment between p2 and p3
    a2 = {'x':(p2.x+p3.x)/2.0, 'y':(p2.y+p3.y)/2.0}; // Midpoint of l2
    l_ratio = Math.sqrt(distSquared(l1)) / (Math.sqrt(distSquared(l1)) + Math.sqrt(distSquared(l2)));
    b = {'x':a1.x*(1-l_ratio) + a2.x*l_ratio, 'y':a1.y*(1-l_ratio) + a2.y*l_ratio}; // Point on the a1a2 line, placed by the relative lengths of l1 and l2.
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
  labelCoords = moveAwayFromCentre(labelCoords, nvrgtr_display_opts.sizes.big_marker_radius+1);
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

    nvrgtr_data.r_paper.path("M"+hull[i].x+","+hull[i].y+" L"+cp1.x+","+cp1.y).attr({stroke:'black', 'stroke-width':0.25});
    nvrgtr_data.r_paper.path("M"+hull[i+1].x+","+hull[i+1].y+" L"+cp2.x+","+cp2.y).attr({stroke:'black', 'stroke-width':0.25});
    nvrgtr_data.r_paper.circle(cp1.x, cp1.y, 0.5).attr({fill:'purple', 'stroke-width':0});
    nvrgtr_data.r_paper.circle(cp2.x, cp2.y, 0.5).attr({fill:'green', 'stroke-width':0});
  }
  return path_str;
}
