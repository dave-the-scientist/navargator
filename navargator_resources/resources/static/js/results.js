// core.js then core_tree_functions.js are loaded before this file.

// This page is loaded, then continually checks with the server to see if the results are ready yet. It might be better (probably not) to use a Flask socket, that allows either the server or client to initiate communication. Good explanation here https://www.shanelynn.ie/asynchronous-updates-to-a-webpage-with-flask-and-socket-io/


// =====  Modified / additional common variables:
$.extend(nvrgtr_page, {
  'page':'results', 'check_results_interval':1000
});
$.extend(nvrgtr_data, {
  'num_variants':null, 'sorted_names':[], 'variants':[], 'clusters':{}, 'variant_distance':{}, 'max_variant_distance':0.0, 'normalized_max_distance':0.0, 'normalized_max_count':0, 'nice_max_var_dist':0.0, 'original_bins':[],
  'graph': {'width':null, 'height':null, 'g':null, 'x_fxn':null, 'y_fxn':null, 'bins':null, 'x_axis':null, 'y_axis':null, 'x_ticks':[]}
});
$.extend(nvrgtr_settings.graph, {
  'margin':{top:0, right:18, bottom:30, left:18}, 'bar_margin_ratio':0.15, 'histo_left_margin':null
});

// Look for clusters of nvrgtr_data.x calls (example nvrgtr_data.graph); cut down on length by adding a middle variable

//BUG:
// - For tree Nm+Ngo+Accessible_Nme_95.nwk, if I set 2 extreme as ignored, and anything not starting with "rf1" as available, and find 8 clusters, the histogram mis-classifies 3 non-chosen vars. The green 'chosen' bar is selecting 11 vars, not 8.

//TODO:
// - Need a more efficient selectNamesByThreshold(). Or do I? It's working surprisingly great on a tree of 1400 sequences.
//   - Should have a data structure that has each node sorted by score, knows the previous call, and the dist the next node is at. Then when it gets called, it checks the new threshold against the 'next node'. If its not there yet, it does nothing. Otherwise processes nodes until it hits the new threshold.
//   - The point is that I don't want to be continualy iterating through the object from beginning to current. This way subsequent iterations start where the previous call left off.
// - Implement button to export the distance histogram as an image.
// - In summary statistics pane should indicate which clustering method was used, and give any relevant info (like support for the pattern if k-medoids, etc).
// - Add an option to visualize the data as a heatmap. Would be symmetrical, with variants on each side, and coloured by distance. The order of the variants would be chosen such that clusters are all together, and maybe keep the tree ordering inside each cluster?
//   - Could just be a pop-up window, or, could potentially replace the tree. I think I could visualize everything from the tree on that heatmap. Useful?

//NOTE (for FAQs or something):
// - If you normalize to a value smaller than the current max, any variants with a distance greater than that will all have the same sized bar graph (it's capped). Further, they will not be visible on the histogram, though they can still be selected with the slider. Same thing if the user selects a max_count smaller than what is to be displayed. The histogram will display and the text will be accurate, but the height will be capped.
// - If you started a run that will take a while, and open one of the results pages before the run is complete, it's possible for the normalization to behave oddly. To be guaranteed accurate the user should click off of global normalization (set to self or something) then back on, once the run is finished.
//   - The low cluster numbers are run first, and should have the highest max distances, but we do use heuristics, so it's not guaranteed. So the max x-value may not be accurate right away.
//   - The higher cluster numbers tend to have the highest max y-value on the histogram, so this is much more likely to be at an intermediate value if a run is in progress. Won't break or anything, but won't be correctly scaled.

// =====  Page setup:
function setupPage() {
  initializeButtons();
  initializeErrorPopupWindow();
  initializeCollapsibleElements();
  initializeFloatingPanes();

  // =====  Variable parsing:
  var url_params = location.search.slice(1).split('_');
  nvrgtr_page.session_id = url_params[0];
  nvrgtr_data.num_variants = url_params[1];
  document.title = '['+nvrgtr_data.num_variants+'] ' + document.title;
  nvrgtr_page.browser_id = generateBrowserId(10);
  console.log('browser ID:', nvrgtr_page.browser_id);
  var graph_width_str = $("#selectionDiv").css('width'),
    graph_height_str = $("#histoSvg").css('height'),
    histo_l_margin_str = $("#histoSlider").css('marginLeft');
  nvrgtr_settings.graph.total_width = parseInt(graph_width_str.slice(0,-2));
  nvrgtr_settings.graph.total_height = parseInt(graph_height_str.slice(0,-2));
  nvrgtr_settings.graph.histo_left_margin = parseInt(histo_l_margin_str.slice(0,-2));

  maintainServer();
  nvrgtr_page.maintain_interval_obj = setInterval(maintainServer, nvrgtr_page.maintain_interval);
  updateClusterColours();
  setupHistoSliderPane();
  setupSelectionPane();
  setupNormalizationPane();
  setupDisplayOptionsPane();
  setupExportPane();
  setupTreeElements();

  $.ajax({
    url: daemonURL('/get-basic-data'),
    type: 'POST',
    contentType: "application/json",
    data: JSON.stringify({'session_id': nvrgtr_page.session_id}),
    success: function(data_obj) {
      parseBasicData(data_obj);
      $("#numClustersH2Span").html(nvrgtr_data.num_variants);
      $("#numClustersSpan").html(nvrgtr_data.num_variants);
      $("#numNodesSpan").html(nvrgtr_data.leaves.length);
      redrawTree(true);
      checkForClusteringResults();
    },
    error: function(error) { processError(error, "Error loading input data from the server"); }
  });
}
function setupHistoSliderPane() {
  // Prevents the css property --histo-bar-colour from inheriting changes to --highlight-colour
  var histo_colour = getComputedStyle(document.documentElement).getPropertyValue('--histo-bar-colour');
  document.documentElement.style.setProperty('--histo-bar-colour', histo_colour);

  var left = $("#leftSliderButton"), middle = $("#middleSliderButton"), reset_button = $("#clearSliderButton"), middle_span = $("#middleSliderButtonSpan"), slider_handle = $("#histoSliderHandle"),
  do_remove = false;
  var mid_offset = middle_span.css('left'), animation_speed = 150, animation_style = 'linear',
    mid_left_arrow = $("#midLeftArrow"), mid_right_arrow = $("#midRightArrow");
  function setButtonAddToSelection() {
    if (do_remove == true) { left.html('Add to<br>selection'); }
    do_remove = false;
  }
  function setButtonRemoveFromSelection() {
    do_remove = true;
    left.html('Cut from<br>selection');
  }
  var slider = $("#histoSlider").slider({
    range: "min",
    min: 0, max: 1.0,
    value: 0, step: 0.001,
    create: function() {
      $("#histoSliderHandle").text($(this).slider("value"));
    },
    slide: function(event, ui) {
      $("#histoSliderHandle").text(ui.value);
      if (selectNamesByThreshold(ui.value, slider.slider('option', 'range') == 'min') == true
          && do_remove == true) {
        setButtonAddToSelection();
      }
    },
    stop: function(event, ui) {
      // Can put selection code here if its too laggy.
    }
  });
  left.click(function() {
    var slider_keys = Object.keys(nvrgtr_data.considered_variants), var_name;
    for (var i=0; i<slider_keys.length; ++i) {
      var_name = slider_keys[i];
      nodeLabelMouseclickHandler(var_name, false, !do_remove);
    }
    numSelectedCallback();
    if (do_remove == false) {
      setButtonRemoveFromSelection();
    } else {
      setButtonAddToSelection();
    }
  });
  middle.click(function() {
    var select_below = slider.slider('option', 'range') == 'min',
      slider_val = slider.slider('value');
    if (slider_val == 0) { slider_val = nvrgtr_data.nice_max_var_dist; }
    else if (slider_val == nvrgtr_data.nice_max_var_dist) { slider_val = 0; }
    if (select_below) { // Switch to above
      slider.slider('option', 'range', 'max');
      middle_span.html('Variants<br>above');
      middle_span.animate({left: '-'+mid_offset}, animation_speed, animation_style);
      mid_left_arrow.animate({opacity:0}, animation_speed, animation_style);
      mid_right_arrow.animate({opacity:1}, animation_speed, animation_style);
    } else { // Switch to below
      slider.slider('option', 'range', 'min');
      middle_span.html('Variants<br>below');
      middle_span.animate({left: mid_offset}, animation_speed, animation_style);
      mid_left_arrow.animate({opacity:1}, animation_speed, animation_style);
      mid_right_arrow.animate({opacity:0}, animation_speed, animation_style);
    }
    slider.slider('value', slider_val);
    slider_handle.text(slider_val);
    setButtonAddToSelection();
    selectNamesByThreshold(slider_val, !select_below);
  });
  reset_button.click(function() {
    var select_below = slider.slider('option', 'range') == 'min',
      slider_val = (select_below) ? 0 : nvrgtr_data.nice_max_var_dist;
    slider.slider('value', slider_val);
    slider_handle.text(slider_val);
    selectNamesByThreshold(slider_val, select_below);
  });
  $("#numSliderSpan").hide();
  setButtonAddToSelection();
}
function setupSelectionPane() {
  $("#clearColoursButton").click(function() {

  });
}
function setupNormalizationPane() {
  var go_button_shown = false;
  var self_radio = $("#normSelfRadio"), global_radio = $("#normGlobalRadio"), custom_radio = $("#normValRadio");
  var custom_input = $("#normValInput"), custom_go_button = $("#normValGoButton");
  function showGoButton() {
    if (go_button_shown == false) {
      custom_go_button.show(100);
      go_button_shown = true;
    }
  }
  function hideGoButton() {
    if (go_button_shown == true) {
      custom_go_button.hide(100);
      go_button_shown = false;
    }
  }
  self_radio.on("change", function(event) {
    hideGoButton();
    nvrgtr_data.normalized_max_distance = nvrgtr_data.max_variant_distance;
    nvrgtr_data.normalized_max_count = 0;
    normalizeResults();
  });
  global_radio.on("change", function(event) {
    hideGoButton();
    $.ajax({
      url: daemonURL('/calculate-global-normalization'),
      type: 'POST',
      contentType: "application/json",
      data: JSON.stringify({'session_id':nvrgtr_page.session_id, 'cur_var':nvrgtr_data.num_variants, 'var_nums':null, 'max_var_dist':nvrgtr_data.max_variant_distance, 'global_bins':nvrgtr_data.original_bins}),
      success: function(data_obj) {
        var data = $.parseJSON(data_obj);
        nvrgtr_data.normalized_max_distance = data.global_value;
        nvrgtr_data.normalized_max_count = data.global_max_count;
        $("#normGlobalValSpan").html('['+roundFloat(data.global_value, 4)+']');
        normalizeResults();
      },
      error: function(error) { processError(error, "Error fetching global normalizations from the server"); }
    });
  });
  custom_radio.click(function(event) {
    var val = custom_input.val();
    if (val == '') {
      custom_input.focus();
      return false; // Prevents the button from being actually selected.
    }
  }).on("change", function(event) {
    nvrgtr_data.normalized_max_distance = custom_input.val();
    nvrgtr_data.normalized_max_count = 0; // Get from UI
    normalizeResults();
  });
  custom_input.on("keydown", function(event) {
    if (event.which == 13) { // 'Enter' key
      custom_input.blur();
      custom_go_button.click();
      return false;
    }
    showGoButton();
  }).blur(function() {
    var val = parseFloat(custom_input.val());
    if (isNaN(val)) {
      val = '';
    }
    custom_input.val(val);
    if (!custom_go_button.is(':active') && !custom_radio.is(':checked')) {
      hideGoButton();
    }
  });
  custom_go_button.click(function() {
    var val = custom_input.val();
    if (val == '') {
      return false;
    } else if (val <= 0) {
      showErrorPopup("Error: the 'normalize' value must be a positive number.");
      custom_input.val('');
      return false;
    }
    hideGoButton();
    custom_radio.prop('checked', true).change();
  });
}
function setupExportPane() {
  var export_pane = $("#exportNamesPane"), export_text = $("#exportNamesText");
  export_pane.data('names', []); // Stores the names, to be manipulated by the pane.
  function formatDisplayExportNames() {
    // Function to format the information based on the user's selection.
    var delimiter = $("#exportDelimiterSelect").val();
    if (delimiter == 'tab') {
      delimiter = '\t';
    } else if (delimiter == 'newline') {
      delimiter = '\n';
    }
    var names = export_pane.data('names'),
      include_scores = ($("#exportNamesCheckbox").is(':checked')) ? false : true,
      new_text_val = '';
    if (typeof names[0] === 'string' || names[0] instanceof String) { // If exporting chosen or selection:
      new_text_val = formatExportNameGroup(names, delimiter, include_scores);
    } else { // Else exporting clusters (names is a list of lists):
      for (var i=0; i<names.length; ++i) {
        new_text_val += formatExportNameGroup(names[i], delimiter, include_scores);
        if (i < names.length - 1) { new_text_val += '\n\n'; }
      }
    }
    export_text.val(new_text_val);
    export_text.css('height', ''); // Need to unset before setting, otherwise it cannot shrink.
    export_text.css('height', export_text[0].scrollHeight+'px');
    showFloatingPane(export_pane);
  }
  // Button callbacks:
  $("#exportChosenButton").click(function() {
    // Sets 'names' to a list of the chosen variants.
    export_pane.data('names', nvrgtr_data.variants.slice());
    formatDisplayExportNames();
  });
  $("#exportSelectionButton").click(function() {
    // Sets 'names' to a list of the selected variants. The order is undefined.
    export_pane.data('names', Object.keys(nvrgtr_data.selected));
    formatDisplayExportNames();
  });
  $("#exportClustersButton").click(function() {
    // Sets 'names' to a list of lists, each sublist begins with the chosen followed by the rest of the variants.
    var clusters = [], chosen, names, vars, name;
    for (var i=0; i<nvrgtr_data.variants.length; ++i) {
      chosen = nvrgtr_data.variants[i];
      names = [chosen];
      vars = nvrgtr_data.clusters[chosen].nodes;
      for (var j=0; j<vars.length; ++j) {
        name = vars[j];
        if (name != chosen) { names.push(name); }
      }
      clusters.push(names);
    }
    export_pane.data('names', clusters);
    formatDisplayExportNames();
  });
  $("#exportTreeButton").click(function() {
    var svg_data = $("#figureSvg")[0].outerHTML;
    downloadData("nvrgtr_tree.svg", svg_data, "image/svg+xml;charset=utf-8");
  });
  // Functionality of the export pane:
  $("#exportNamesCheckbox, #exportNamesAndScoresCheckbox").change(function() {
    formatDisplayExportNames();
  });
  $("#exportDelimiterSelect").change(function() {
    formatDisplayExportNames();
  });
  $("#exportNamesCopyButton").click(function() {
    export_text.select();
    document.execCommand("copy");
  });
  $("#exportNamesSaveButton").click(function() {
    var text_data = export_text.val();
    downloadData("nvrgtr_data.txt", text_data, "text/plain");
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
    contentType: "application/json",
    data: JSON.stringify({'session_id': nvrgtr_page.session_id, 'num_vars': nvrgtr_data.num_variants}),
    success: function(data_obj) {
      var data = $.parseJSON(data_obj);
      if (data.variants == false) {
        setTimeout(checkForClusteringResults, nvrgtr_page.check_results_interval);
      } else {
        $("#treeLoadingMessageGroup").remove();
        parseClusteredData(data);
        drawBarGraphs();
        extendTreeLegend();
        updateSummaryStats();
        updateNormalizationPane();
        drawClusters();
        updateClusteredVariantMarkers(); // Must be after drawBarGraphs and drawClusters
        drawDistanceHistogram();
        updateHistoSlider(); // Must be after drawDistanceHistogram
        $("#treeSelectionDiv").show();
        $("#treeControlsDiv").show();
        $("#treeLegendLeftGroup").show();
      }
    },
    error: function(error) { processError(error, "Error getting clustering data from the server"); }
  });
}
function redrawTree(initial_draw=false) {
  drawTree(false);
  if (initial_draw == false) {
    $("#clearSliderButton").click();
    drawBarGraphs();
    drawClusters();
    updateClusteredVariantMarkers();
  }
}
function extendTreeLegend() {
  var contains_singletons = false, clstr;
  for (var i=0; i<nvrgtr_data.num_variants; ++i) {
    clstr = nvrgtr_data.clusters[nvrgtr_data.variants[i]];
    if (clstr.nodes.length == 1) {
      contains_singletons = true;
      break;
    }
  }
  if (contains_singletons) {
    d3.select("#treeLegendLeftGroup").append("circle")
      .attr('id', 'legendSingletonMarker')
      .attr('cx', 10)
      .attr('cy', 88)
      .attr('r', 4)
      .attr('fill', '#9624F0');
    d3.select("#treeLegendLeftGroup").append("text")
      .attr('x', 18)
      .attr('y', 92)
      .attr('font-family', 'Helvetica,Arial,sans-serif')
      .attr('font-size', '12px')
      .text('Singleton cluster');
    var new_height = parseFloat($("#legendBorderRect").attr('height')) + 18;
    $("#legendBorderRect").attr('height', new_height);
    // Update the size of the figure if necessary:
    var canvas_height = calculateTreeCanvasHeight(nvrgtr_display_opts.sizes.tree);
    $("#figureSvg").attr({'height':canvas_height});
  }
  updateTreeLegend();
}
function updateSummaryStats() {
  var cluster_dist = 0.0, node_dist = 0.0, num_nodes = 0;
  for (var i=0; i<nvrgtr_data.variants.length; ++i) {
    cluster_dist += nvrgtr_data.clusters[nvrgtr_data.variants[i]].score;
  }
  $("#distTotalSpan").html(roundFloat(cluster_dist, 4));
  cluster_dist = roundFloat(cluster_dist/nvrgtr_data.variants.length, 4);
  $.each(nvrgtr_data.variant_distance, function(var_name, dist) {
    node_dist += dist;
    num_nodes += 1;
  });
  node_dist = roundFloat(node_dist/num_nodes, 4);
  $("#distClustersSpan").html(cluster_dist);
  $("#distNodesSpan").html(node_dist);
}
function updateNormalizationPane() {
  $("#normSelfValSpan").html('['+roundFloat(nvrgtr_data.max_variant_distance, 4)+']');
}
function drawClusters() {
  var var_names;
  var_names = nvrgtr_data.variants.slice();
  var_names.sort(function(a,b) {
    return nvrgtr_data.clusters[a].nodes.length - nvrgtr_data.clusters[b].nodes.length;
  });
  $(".cluster-list-row").remove();
  var var_name, cluster_row, ret, cluster_obj, mouseover_obj, to_front = [],
    table_body = $("#clustersListTable > tbody");
  for (var i=0; i<var_names.length; ++i) {
    var_name = var_names[i];
    cluster_row = createClusterRow(var_name, table_body);
    table_body.append(cluster_row);
    ret = drawClusterObject(nvrgtr_data.clusters[var_name].nodes);
    cluster_obj = ret[0];
    mouseover_obj = ret[1];
    nvrgtr_data.clusters[var_name].cluster_obj = cluster_obj;
    if (mouseover_obj == false) { // Singleton cluster
      nvrgtr_data.clusters[var_name].colour_key = 'singleton_cluster_background';
      addSingletonClusterObjRowHandlers(var_name, cluster_obj, cluster_row);
      // The node markers are pushed to_front in updateClusteredVariantMarkers()
    } else { // Non singleton cluster
      nvrgtr_data.clusters[var_name].colour_key = 'cluster_background_trans';
      addClusterObjRowHandlers(var_name, mouseover_obj, cluster_row);
      to_front.push(mouseover_obj);
    }
  }
  for (var i=to_front.length-1; i>=0; --i) {
    to_front[i].toFront(); // Puts the smallest invisible mouseover objects in front of the larger ones.
  }
  nvrgtr_data.tree_background.toBack();
}
function createClusterRow(var_name, table_body) {
  var dec_precision = 4,
    clstr_size = nvrgtr_data.clusters[var_name].nodes.length,
    clstr_score = nvrgtr_data.clusters[var_name].score,
    clstr_avg_score = 0, score_90th = 0;
  if (clstr_size > 1) {
    clstr_avg_score = roundFloat(clstr_score/(clstr_size-1), dec_precision); // size-1 removes the rep var.
    score_90th = roundFloat(calculate90Percentile(nvrgtr_data.clusters[var_name].nodes), dec_precision);
  }
  var name_td, short_name;
  if (var_name.length > nvrgtr_display_opts.sizes.max_variant_name_length) {
    short_name = var_name.slice(0, nvrgtr_display_opts.sizes.max_variant_name_length);
    name_td = "<td title='"+var_name+"'>"+short_name+"</td>";
  } else {
    name_td = "<td>"+var_name+"</td>";
  }
  var size_td = "<td>"+clstr_size+"</td>",
    avg_dist_td = "<td>"+clstr_avg_score+"</td>",
    score_td = "<td>"+score_90th+"</td>";
  return $("<tr class='cluster-list-row' variant-name='" +var_name+ "'>" +name_td +size_td +avg_dist_td +score_td+ "</tr>");
}
function updateClusteredVariantMarkers() {
  // Colours the chosen, available, and ignored nodes. Also adds tooltips to the mouseover object.
  var var_name, circle, circle_colour_key;
  for (var i=0; i<nvrgtr_data.leaves.length; ++i) {
    var_name = nvrgtr_data.leaves[i], node = nvrgtr_data.nodes[var_name];
    circle = node.circle;
    if (nvrgtr_data.variants.indexOf(var_name) != -1) {
      circle_colour_key = (nvrgtr_data.clusters[var_name].nodes.length > 1) ? 'chosen' : 'singleton_cluster_background';
      circle.attr({'r':nvrgtr_display_opts.sizes.big_marker_radius});
      changeNodeStateColour(var_name, node.label_highlight, 'label_mouseover', 'chosen');
    } else if (nvrgtr_data.available.indexOf(var_name) != -1) {
      circle_colour_key = 'available';
    } else if (nvrgtr_data.ignored.indexOf(var_name) != -1) {
      circle_colour_key = 'ignored';
      circle.attr({'r':nvrgtr_display_opts.sizes.big_marker_radius});
    } else {
      circle_colour_key = 'default_node';
    }
    changeNodeStateColour(var_name, circle, 'node_rest', circle_colour_key);
    circle.toFront();
    circle.attr({title: node.tooltip});
    node.label_mouseover.attr({title: node.tooltip});
  }
}
function updateClusterTransColourFollowup(key, trans_comp) {
  // Called by core.js when the user changes the cluster or mouseover colour.
  if (key == 'cluster_background') {
    $.each(nvrgtr_data.clusters, function(name, clstr) {
      if (clstr.nodes.length == 1) { return; }
      clstr.cluster_obj.attr({fill:trans_comp});
    });
  } else if (key == 'cluster_background') {

  }
}
function normalizeResults() {
  updateBarGraphHeights();
  updateHistogram();
  updateHistoSlider();
}
function updateBarGraphHeights() {
  var var_name, var_angle, dist, new_path_str;
  for (var i=0; i<treeDrawingParams.seqs.length; ++i) {
    var_name = treeDrawingParams.seqs[i][0];
    var_angle = treeDrawingParams.seqs[i][1];
    dist = nvrgtr_data.variant_distance[var_name];
    if (dist) { // Not a chosen or ignored variant:
      new_path_str = getBarGraphPathStr(var_name, var_angle, dist);
      nvrgtr_data.nodes[var_name].bar_chart.animate({path:new_path_str}, 200, 'linear');
    }
  }
}
function drawDistanceHistogram() {
  var margin = nvrgtr_settings.graph.margin,
    total_width = nvrgtr_settings.graph.total_width,
    total_height = nvrgtr_settings.graph.total_height;
  nvrgtr_data.graph.width = total_width - margin.right - margin.left;
  nvrgtr_data.graph.height = total_height - margin.top - margin.bottom;
  // Set up svg objects:
  var svg = d3.select("#histoSvg")
    .attr("width", total_width)
    .attr("height", total_height);
  nvrgtr_data.graph.g = svg.append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
  // Set up scales and data objects:
  nvrgtr_data.graph.x_fxn = d3.scaleLinear()
    .rangeRound([0, nvrgtr_data.graph.width]);
  nvrgtr_data.graph.y_fxn = d3.scaleLinear()
    .range([0, nvrgtr_data.graph.height])
    .clamp(true);
  // Graph title:
  /*svg.append("text")
    .attr("class", "histo-title")
    .attr("dy", "0.8em") //.attr("dy", ".35em")
    .attr("x", total_width / 2)
    .attr("text-anchor", "middle")
    .text("Distribution of distances");*/
  // Graph axes:
  nvrgtr_data.graph.x_axis = d3.axisBottom(nvrgtr_data.graph.x_fxn);
  nvrgtr_data.graph.y_axis = d3.axisLeft(nvrgtr_data.graph.y_fxn).tickValues([]).tickSize(0);
  nvrgtr_data.graph.g.append("g")
    .attr("class", "x-axis")
    .attr("transform", "translate(0," + nvrgtr_data.graph.height + ")");
  nvrgtr_data.graph.g.append("g")
    .attr("class", "y-axis");
  var y_axis_vert_offset = 5, y_axis_horiz_offset = -6;
  nvrgtr_data.graph.g.append("text") // y axis label
    .attr("class", "histo-axis-label")
    .attr("text-anchor", "middle")
    .attr("x", 0 - nvrgtr_data.graph.height/2 - y_axis_vert_offset)
    .attr("y", 0 + y_axis_horiz_offset)
    .attr("transform", "rotate(-90)")
    .text("Number of variants");

  // Draw the graph:
  updateHistogram();
}
function updateHistogram() {
  updateHistoBins();
  updateHistoGraph();
  updateHistoAxes();
}
function updateHistoSlider() {
  $("#histoSlider").slider({
    max:nvrgtr_data.nice_max_var_dist
  });
}

// =====  Event handlers and callbacks:
function addSingletonClusterObjRowHandlers(var_name, circle_obj, cluster_row) {
  // Adds an additional handler to each circle.mouseover and .mouseout; doesn't replace the existing handlers.
  circle_obj.mouseover(function() {
    cluster_row.css('background-color', nvrgtr_display_opts.colours.cluster_highlight);
  }).mouseout(function() {
    cluster_row.css('background-color', '');
  });
  cluster_row.mouseenter(function() {
    cluster_row.css('background-color', nvrgtr_display_opts.colours.cluster_highlight);
    nodeLabelMouseoverHandler(var_name);
  }).mouseleave(function() {
    cluster_row.css('background-color', '');
    nodeLabelMouseoutHandler(var_name);
  }).click(function() {
    nodeLabelMouseclickHandler(var_name);
  });
}
function addClusterObjRowHandlers(var_name, mouseover_obj, cluster_row) {
  mouseover_obj.mouseover(function() {
    clusterMouseoverHandler(var_name, cluster_row);
  }).mouseout(function() {
    clusterMouseoutHandler(var_name, cluster_row);
  }).click(function() {
    if (!nvrgtr_data.allow_select) { return true; }
    clusterMouseclickHandler(var_name);
  });
  cluster_row.mouseenter(function() {
    clusterMouseoverHandler(var_name, cluster_row);
  }).mouseleave(function() {
    clusterMouseoutHandler(var_name, cluster_row);
  }).click(function() {
    clusterMouseclickHandler(var_name);
  });
}
function clusterMouseoverHandler(var_name, cluster_row) {
  var cluster = nvrgtr_data.clusters[var_name];
  cluster_row.css('background-color', nvrgtr_display_opts.colours.cluster_highlight);
  cluster.cluster_obj.attr({fill:nvrgtr_display_opts.colours.cluster_highlight_trans});
  for (var i=0; i<cluster.nodes.length; ++i) {
    nodeLabelMouseoverHandler(cluster.nodes[i], false);
  }
}
function clusterMouseoutHandler(var_name, cluster_row) {
  var cluster = nvrgtr_data.clusters[var_name],
    orig_colour = nvrgtr_display_opts.colours[cluster.colour_key];
  cluster_row.css('background-color', '');
  cluster.cluster_obj.attr({fill:orig_colour});
  for (var i=0; i<cluster.nodes.length; ++i) {
    nodeLabelMouseoutHandler(cluster.nodes[i]);
  }
}
function clusterMouseclickHandler(var_name) {
  var cluster = nvrgtr_data.clusters[var_name];
  for (var i=0; i<cluster.nodes.length; ++i) {
    nodeLabelMouseclickHandler(cluster.nodes[i], false);
  }
  numSelectedCallback();
}
function numSelectedCallback() {
  $("#currentSelectionNum").html(nvrgtr_data.num_selected);
}
function selectNamesByThreshold(threshold, select_below) {
  // Could implement a short-circuit in case the threshold hasn't changed.
  var threshold_val = [threshold, select_below], num_picked = 0, has_changed = false;
  if ( !(select_below && threshold == 0) &&
       !(!select_below && threshold == nvrgtr_data.nice_max_var_dist) ) {
    $.each(nvrgtr_data.variant_distance, function(var_name, dist) {
      if (select_below && dist <= threshold || !select_below && dist >= threshold) {
        num_picked += 1;
        if (nvrgtr_data.considered_variants[var_name] == undefined) {
          nodeLabelMouseoverHandler(var_name);
          has_changed = true;
        }
        nvrgtr_data.considered_variants[var_name] = threshold_val; // Add / update var_name in considered_variants.
      }
    });
  }
  var slider_keys = Object.keys(nvrgtr_data.considered_variants), var_name;
  for (var i=0; i<slider_keys.length; ++i) {
    var_name = slider_keys[i];
    if (nvrgtr_data.considered_variants[var_name] != threshold_val) {
      delete nvrgtr_data.considered_variants[var_name];
      nodeLabelMouseoutHandler(var_name);
      has_changed = true;
    }
  }
  if (num_picked == 0) {
    $("#numSliderSpan").hide();
  } else {
    $("#numSliderSpan").html(num_picked+' variants');
    $("#numSliderSpan").show();
  }
  return has_changed;
}

// =====  Graph functions:
function updateHistoBins() {
  var x_ticks = calculateHistoTicks(nvrgtr_data.normalized_max_distance);
  nvrgtr_data.nice_max_var_dist = roundFloat(x_ticks[x_ticks.length-1], 3);
  nvrgtr_data.graph.x_fxn.domain([x_ticks[0], nvrgtr_data.nice_max_var_dist]); // Needed to include the final tick

  var num_chosen = nvrgtr_data.variants.length,
    non_chosen_dists = nvrgtr_data.sorted_names.slice(num_chosen).map(function(name) {
      return nvrgtr_data.variant_distance[name];
    });
  nvrgtr_data.graph.bins = d3.histogram()
    .domain([x_ticks[0], nvrgtr_data.normalized_max_distance])
    .thresholds(x_ticks)(non_chosen_dists);
  for (var i=0; i<num_chosen; ++i) {
    nvrgtr_data.graph.bins[0].push(0.0); // Add values for the chosen variants.
  }
  var prev_ind = 0, cur_len;
  for (var i=0; i<nvrgtr_data.graph.bins.length; ++i) {
    cur_len = nvrgtr_data.graph.bins[i].length;
    nvrgtr_data.graph.bins[i]['names'] = nvrgtr_data.sorted_names.slice(prev_ind, prev_ind+cur_len);
    prev_ind += cur_len;
  }
  var max_y = (nvrgtr_data.normalized_max_count > 0) ? nvrgtr_data.normalized_max_count : d3.max(nvrgtr_data.graph.bins, function(d) { return d.length; });
  nvrgtr_data.graph.y_fxn.domain([0, max_y]);
  nvrgtr_data.graph.x_ticks = x_ticks;
}
function updateHistoGraph() {
  var formatCount = d3.format(",.0f"),
    col_width = nvrgtr_data.graph.x_fxn(0), // Zero is now the 2nd tick.
    bar_margin = col_width * nvrgtr_settings.graph.bar_margin_ratio / 2,
    bar_width = col_width - bar_margin * 2,
    init_bar_x = nvrgtr_data.graph.width - bar_width;
  // The bars of the graph:
  var bar_elements = nvrgtr_data.graph.g.selectAll(".histo-bar")
    .data(nvrgtr_data.graph.bins);
  bar_elements.enter().append("rect")
    .attr("class", "histo-bar")
    .attr("x", init_bar_x)
    .attr("y", nvrgtr_data.graph.height)
    .attr("width", bar_width)
    .attr("height", 0)
    .transition()
    .attr("height", function(d) { return nvrgtr_data.graph.y_fxn(d.length); })
    .attr("transform", function(d) {
      return "translate(" + (nvrgtr_data.graph.x_fxn(d.x0)+bar_margin-init_bar_x) + "," + (-nvrgtr_data.graph.y_fxn(d.length)) + ")";
    });
  bar_elements.transition()
    .attr("x", init_bar_x)
    .attr("width", bar_width)
    .attr("height", function(d) { return nvrgtr_data.graph.y_fxn(d.length); })
    .attr("transform", function(d) {
      return "translate(" + (nvrgtr_data.graph.x_fxn(d.x0)+bar_margin-init_bar_x) + "," + (-nvrgtr_data.graph.y_fxn(d.length)) + ")";
    });
  bar_elements.exit()
    .transition()
    .attr("height", 0)
    .attr("transform", "translate(0,0)")
    .remove();
  // The text label for each bar:
  var text_y_offset = 10,
    half_col = col_width / 2,
    init_text_x = nvrgtr_data.graph.width - half_col,
    max_text_y = nvrgtr_data.graph.height - text_y_offset;
  var bar_texts = nvrgtr_data.graph.g.selectAll(".histo-text")
    .data(nvrgtr_data.graph.bins);
  bar_texts.enter().append("text")
    .attr("class", "histo-text prevent-text-selection")
    .attr("x", init_text_x)
    .attr("y", max_text_y)
    .attr("dy", ".35em") // essentially a vertical-align: middle.
    .attr("text-anchor", "middle")
    .transition()
    .attr("transform", function(d) {
      return "translate(" + (nvrgtr_data.graph.x_fxn(d.x0)+half_col-init_text_x) + "," + ( Math.min(2*text_y_offset-nvrgtr_data.graph.y_fxn(d.length), 0) ) + ")";
    })
    .text(function(d) { return (d.length == 0) ? '' : formatCount(d.length); });
  bar_texts.transition()
    .attr("x", init_text_x)
    .attr("transform", function(d) {
      return "translate(" + (nvrgtr_data.graph.x_fxn(d.x0)+half_col-init_text_x) + "," + ( Math.min(2*text_y_offset-nvrgtr_data.graph.y_fxn(d.length), 0) ) + ")";
    })
    .text(function(d) { return (d.length == 0) ? '' : formatCount(d.length); });
  bar_texts.exit().remove();
  // A transparent full-sized rect on top to capture mouse events:
  var bar_mouseovers = nvrgtr_data.graph.g.selectAll(".histo-overlay")
    .data(nvrgtr_data.graph.bins);
  bar_mouseovers.enter().append("rect")
    .attr("class", "histo-overlay")
    .attr("x", function(d) { return nvrgtr_data.graph.x_fxn(d.x0); })
    .attr("width", col_width)
    .attr("height", nvrgtr_data.graph.height)
    .attr("fill", "transparent").attr("stroke-width", 0).attr("stroke", "none")
    .on("mouseover", function(d) {
      for (var i=0; i<d.names.length; ++i) { nodeLabelMouseoverHandler(d.names[i]); }
    })
    .on("mouseout", function(d) {
      for (var i=0; i<d.names.length; ++i) { nodeLabelMouseoutHandler(d.names[i]); }
    })
    .on("click", function(d) {
      for (var i=0; i<d.names.length; ++i) {
        nodeLabelMouseclickHandler(d.names[i], false);
      }
      numSelectedCallback();
    });
  bar_mouseovers.attr("width", col_width)
  .attr("x", function(d) { return nvrgtr_data.graph.x_fxn(d.x0); });
  bar_mouseovers.exit().remove();

  // Update the histo slider, so its zero lines up with the graph's zero.
  var new_l_margin = nvrgtr_settings.graph.histo_left_margin + col_width;
  $("#histoSlider").animate({'marginLeft':new_l_margin+'px'}, 250);
}
function updateHistoAxes() {
  var ticks = nvrgtr_data.graph.x_ticks.slice(1); // Removes the first value (placeholder for 'chosen' bar).
  nvrgtr_data.graph.x_axis.tickValues(ticks)
    .tickFormat(d3.format(".3")); // trims trailing zeros
  nvrgtr_data.graph.g.select(".x-axis")
    .transition()
    .call(nvrgtr_data.graph.x_axis)
    .selectAll("text")
      .style("text-anchor", "start")
      .attr("x", 7)
      .attr("y", 5)
      .attr("dy", ".35em")
      .attr("transform", "rotate(55)");
  nvrgtr_data.graph.g.select(".y-axis")
    .transition()
    .call(nvrgtr_data.graph.y_axis);
}

// =====  Data parsing:
function parseClusteredData(data) {
  if (data.variants.length != nvrgtr_data.num_variants) {
    showErrorPopup("Error: data appears to be corrupted (num_variants and variants disagree).");
    return false;
  }
  nvrgtr_data.variant_distance = data.variant_distance;
  nvrgtr_data.max_variant_distance = data.max_variant_distance;
  nvrgtr_data.original_bins = calculateHistoTicks(data.max_variant_distance);

  // Check if a normalization is already set (from the server). Else:
  nvrgtr_data.normalized_max_distance = data.normalization.value;
  nvrgtr_data.normalized_max_count = data.normalization.max_count;
  if (data.normalization.method == 'global') {
    $("#normGlobalRadio").prop('checked', true);
    $("#normGlobalValSpan").html('['+roundFloat(data.normalization.value, 4)+']');
  } else if (data.normalization.method == 'custom') {
    $("#normValRadio").prop('checked', true);
    $("#normValInput").val(data.normalization.value);
  }
  nvrgtr_data.variants = data.variants;
  // Ensures nvrgtr_data.sorted_names begins with the chosen variants, and the rest stably sorted by variant distance.
  var delta, sorted_names = Object.keys(nvrgtr_data.variant_distance).filter(function(name) {
    return (data.variants.indexOf(name) == -1);
  }).sort();
  sorted_names = sorted_names.sort(function(a,b) {
    delta = nvrgtr_data.variant_distance[a] - nvrgtr_data.variant_distance[b];
    return (delta != 0) ? delta : (sorted_names.indexOf(a) - sorted_names.indexOf(b));
  });
  nvrgtr_data.sorted_names = data.variants.concat(sorted_names);
  // Sets up cluster object.
  nvrgtr_data.clusters = {};
  for (var i=0; i<nvrgtr_data.variants.length; ++i) {
    nvrgtr_data.clusters[nvrgtr_data.variants[i]] = {'score':data.scores[i], 'nodes':data.clusters[i], 'cluster_obj':null, 'colour_key':''};
  }
}

// =====  Misc functions:
function formatExportNameGroup(names, delimiter, include_scores) {
  var text_val = '';
  if (include_scores === false) {
    text_val = names.join(delimiter);
  } else {
    var dist, val;
    for (var i=0; i<names.length; ++i) {
      dist = nvrgtr_data.variant_distance[names[i]];
      if (dist === undefined) { dist = ''; }
      val = names[i] + delimiter + dist;
      if (i < names.length - 1) { val += '\n'; }
      text_val += val;
    }
  }
  return text_val;
}
function downloadData(filename, data, blob_type) {
  var blob = new Blob([data], {type:blob_type}),
    blob_url = URL.createObjectURL(blob),
    download_link = document.createElement("a");
  download_link.href = blob_url;
  download_link.download = filename;
  download_link.click();
  download_link = null; // Removes the element
}
