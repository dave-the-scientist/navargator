// core.js then core_tree_functions.js are loaded before this file.

// This page is loaded, then continually checks with the server to see if the results are ready yet. It might be better (probably not) to use a Flask socket, that allows either the server or client to initiate communication. Good explanation here https://www.shanelynn.ie/asynchronous-updates-to-a-webpage-with-flask-and-socket-io/


// =====  Modified / additional common variables:
$.extend(page, {
  'check_results_interval':1000
});
$.extend(repvar, {
  'num_variants':null, 'sorted_names':[], 'variants':[], 'clusters':{}, 'variant_distance':{}, 'max_variant_distance':0.0, 'normalized_max_distance':0.0, 'normalized_max_count':0, 'nice_max_var_dist':0.0, 'original_bins':[]
});
$.extend(repvar.opts.colours, {
  'cluster_background_trans':null, 'cluster_highlight_trans':null
});
$.extend(repvar.opts.graph, {
  'margin':{top:0, right:18, bottom:30, left:18}, 'bar_margin_ratio':0.15
});
repvar.graph = {'width':null, 'height':null, 'g':null, 'x_fxn':null, 'y_fxn':null, 'bins':null, 'x_axis':null, 'y_axis':null, 'x_ticks':[]};

//BUG:


//TODO:
// - Ensure setTransparentColour() is working right in updateColours(). Add colour pickers to display options.
// - Get export buttons working.
// - Need a more efficient selectNamesByThreshold().
//   - Should have a data structure that has each node sorted by score, knows the previous call, and the dist the next node is at. Then when it gets called, it checks the new threshold against the 'next node'. If its not there yet, it does nothing. Otherwise processes nodes until it hits the new threshold.
//   - The point is that I don't want to be continualy iterating through the object from beginning to current. This way subsequent iterations start where the previous call left off.
// - In summary statistics pane should indicate which clustering method was used, and give any relevant info (like support for the pattern if k-medoids, etc).
// - Change mentions of 'node' to 'variant'.
// - I don't love the singleton cluster colour of dark blue. Maybe a red/orange would be better. Want them to jump out, and having negative connotations is good.
// - Is repvar.nice_max_var_dist useful?

//NOTE (for FAQs or something):
// - If you normalize to a value smaller than the current max, any variants with a distance greater than that will all have the same sized bar graph (it's capped). Further, they will not be visible on the histogram, though they can still be selected with the slider. Same thing if the user selects a max_count smaller than what is to be displayed. The histogram will display and the text will be accurate, but the height will be capped.
// - If you started a run that will take a while, and open one of the results pages before the run is complete, it's possible for the normalization to behave oddly. To be guaranteed accurate the user should click off of global normalization (set to self or something) then back on, once the run is finished.
//   - The low cluster numbers are run first, and should have the highest max distances, but we do use heuristics, so it's not guaranteed. So the max x-value may not be accurate.
//   - The higher cluster numbers tend to have the highest max y-value on the histogram, so this is much more likely to be at an intermediate value if a run is in progress. Won't break or anything, but won't be correctly scaled.

// =====  Page setup:
function setupPage() {
  initializeButtons();
  $("#errorDialog").dialog({modal:true, autoOpen:false,
    buttons:{Ok:function() { $(this).dialog("close"); }}
  }); // Sets up error dialog, which is hidden until called with showErrorPopup(message, title).
  initializeCollapsibleElements();

  // =====  Variable parsing:
  var url_params = location.search.slice(1).split('_');
  page.session_id = url_params[0];
  repvar.num_variants = url_params[1];
  document.title = '['+repvar.num_variants+'] ' + document.title;
  page.browser_id = generateBrowserId(10);
  console.log('browser ID:', page.browser_id);
  var tree_width_str = $("#mainTreeDiv").css('width'),
    graph_width_str = $("#selectionDiv").css('width'),
    graph_height_str = $("#histoSvg").css('height');
  repvar.opts.sizes.tree = parseInt(tree_width_str.slice(0,-2));
  repvar.opts.graph.total_width = parseInt(graph_width_str.slice(0,-2));
  repvar.opts.graph.total_height = parseInt(graph_height_str.slice(0,-2));


  maintainServer();
  page.maintain_interval_obj = setInterval(maintainServer, page.maintain_interval);
  setupHistoSliderPane();
  setupSelectionPane();
  setupNormalizationPane();
  setupDisplayOptionsPane();
  setupExportPane();
  setupTreeElements();

  $.ajax({
    url: daemonURL('/get-input-data'),
    type: 'POST',
    data: {'session_id': page.session_id},
    success: function(data_obj) {
      parseRepvarData(data_obj);
      $("#numClustersH2Span").html(repvar.num_variants);
      $("#numClustersSpan").html(repvar.num_variants);
      $("#numNodesSpan").html(repvar.leaves.length);
      drawTree(false);
      checkForClusteringResults();
    },
    error: function(error) { processError(error, "Error loading input data from the server"); }
  });
}
function setupHistoSliderPane() {
  var left = $("#leftSliderButton"), middle = $("#middleSliderButton"), right = $("#rightSliderButton"), middle_span = $("#middleSliderButtonSpan"), slider_handle = $("#histoSliderHandle"),
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
    var slider_keys = Object.keys(repvar.considered_variants), var_name;
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
    if (slider_val == 0) { slider_val = repvar.nice_max_var_dist; }
    else if (slider_val == repvar.nice_max_var_dist) { slider_val = 0; }
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
  right.click(function() {
    var select_below = slider.slider('option', 'range') == 'min',
      slider_val = (select_below) ? 0 : repvar.nice_max_var_dist;
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
function colourSelectionChange(choice) {
  console.log('picked', choice);
}
function colourSelectPicked(jscol) {
  // not yet implemented
  console.log('chose', '#'+jscol);
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
    repvar.normalized_max_distance = repvar.max_variant_distance;
    repvar.normalized_max_count = 0;
    normalizeResults();
  });
  global_radio.on("change", function(event) {
    hideGoButton();
    $.ajax({
      url: daemonURL('/calculate-global-normalization'),
      type: 'POST',
      data: {'session_id':page.session_id, 'cur_var':repvar.num_variants, 'var_nums':null, 'max_var_dist':repvar.max_variant_distance, 'global_bins':repvar.original_bins},
      success: function(data_obj) {
        var data = $.parseJSON(data_obj);
        repvar.normalized_max_distance = data.global_value;
        repvar.normalized_max_count = data.global_max_count;
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
    repvar.normalized_max_distance = custom_input.val();
    repvar.normalized_max_count = 0; // Get from UI
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
function setupDisplayOptionsPane() {

}
function setupExportPane() {
  $("#exportRepsButton").click(function() {

  });
  $("#exportClustersButton").click(function() {

  });
  $("#exportSelectionButton").click(function() {

  });
  $("#exportTreeButton").click(function() {

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
    data: {'session_id': page.session_id, 'num_vars': repvar.num_variants},
    success: function(data_obj) {
      var data = $.parseJSON(data_obj);
      if (data.variants == false) {
        setTimeout(checkForClusteringResults, page.check_results_interval);
      } else {
        parseClusteredData(data);
        updateColours();
        drawBarGraphs();
        updateSummaryStats();
        updateNormalizationPane();
        drawClusters();
        updateClusteredVariantMarkers(); // Must be after drawBarGraphs and drawClusters
        drawDistanceHistogram();
        updateHistoSlider(); // Must be after drawDistanceHistogram
      }
    },
    error: function(error) { processError(error, "Error getting clustering data from the server"); }
  });
}
function updateColours() {
  // Parses the color pickers under display options, update repvar.opts.colours.
  // When user sets cluster_background and cluster_highlight colours, need to check if the transparent colours will be identical. If not, display one of the warning triangle icons by the colour picker.
  // - If bg_r*(1-opacity) > colour_r: then it's not possible to mimick the desired colour with the given transparency and background. Either opacity must be increased, the background made darker, or the desired colour made lighter. Similarly, if bg_r*(1-opacity) Obviously likewise for _g and _b channels. Easiest answer is to just increase opacity, which only matters if there is part of a cluster drawn behind another.
  // Calculate the cluster transparent
  setTransparentColour('cluster_background_trans', repvar.opts.colours.cluster_background, repvar.opts.colours.tree_background);
  setTransparentColour('cluster_highlight_trans', repvar.opts.colours.cluster_highlight, repvar.opts.colours.tree_background);
}

function updateSummaryStats() {
  var cluster_dist = 0.0, node_dist = 0.0, num_nodes = 0;
  for (var i=0; i<repvar.variants.length; ++i) {
    cluster_dist += repvar.clusters[repvar.variants[i]].score;
  }
  $("#distTotalSpan").html(roundFloat(cluster_dist, 4));
  cluster_dist = roundFloat(cluster_dist/repvar.variants.length, 4);
  $.each(repvar.variant_distance, function(var_name, dist) {
    node_dist += dist;
    num_nodes += 1;
  });
  node_dist = roundFloat(node_dist/num_nodes, 4);
  $("#distClustersSpan").html(cluster_dist);
  $("#distNodesSpan").html(node_dist);
}
function updateNormalizationPane() {
  $("#normSelfValSpan").html('['+roundFloat(repvar.max_variant_distance, 4)+']');
}
function drawClusters() {
  var var_names;
  var_names = repvar.variants.slice();
  var_names.sort(function(a,b) {
    return repvar.clusters[a].nodes.length - repvar.clusters[b].nodes.length;
  });
  var var_name, cluster_row, ret, cluster_obj, mouseover_obj, to_front = [],
    table_body = $("#clustersListTable > tbody");
  for (var i=0; i<var_names.length; ++i) {
    var_name = var_names[i];
    cluster_row = createClusterRow(var_name, table_body);
    table_body.append(cluster_row);
    ret = drawClusterObject(repvar.clusters[var_name].nodes);
    cluster_obj = ret[0];
    mouseover_obj = ret[1];
    repvar.clusters[var_name].cluster_obj = cluster_obj;
    if (mouseover_obj == false) { // Singleton cluster
      repvar.clusters[var_name].colour_key = 'singleton_cluster_background';
      addSingletonClusterObjRowHandlers(var_name, cluster_obj, cluster_row);
      // The node markers are pushed to_front in updateClusteredVariantMarkers()
    } else { // Non singleton cluster
      repvar.clusters[var_name].colour_key = 'cluster_background_trans';
      addClusterObjRowHandlers(var_name, mouseover_obj, cluster_row);
      to_front.push(mouseover_obj);
    }
  }
  for (var i=to_front.length-1; i>=0; --i) {
    to_front[i].toFront(); // Puts the smallest invisible mouseover objects in front of the larger ones.
  }
  repvar.tree_background.toBack();
}
function createClusterRow(var_name, table_body) {
  var dec_precision = 4,
    clstr_size = repvar.clusters[var_name].nodes.length,
    clstr_score = repvar.clusters[var_name].score,
    clstr_avg_score = 0, score_90th = 0;
  if (clstr_size > 1) {
    clstr_avg_score = roundFloat(clstr_score/(clstr_size-1), dec_precision); // size-1 removes the rep var.
    score_90th = roundFloat(calculate90Percentile(repvar.clusters[var_name].nodes), dec_precision);
  }
  var name_td, short_name;
  if (var_name.length > repvar.opts.sizes.max_variant_name_length) {
    short_name = var_name.slice(0, repvar.opts.sizes.max_variant_name_length);
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
  // Colours the chosen, available, and ignored nodes. Also adds tooltips to
  var var_name, circle, circle_colour_key;
  for (var i=0; i<repvar.leaves.length; ++i) {
    var_name = repvar.leaves[i], node = repvar.nodes[var_name];
    circle = node.circle;
    if (repvar.variants.indexOf(var_name) != -1) {
      circle_colour_key = (repvar.clusters[var_name].nodes.length > 1) ? 'chosen' : 'singleton_cluster_background';
      circle.attr({'r':repvar.opts.sizes.big_marker_radius});
      changeNodeStateColour(var_name, node.label_highlight, 'label_mouseover', 'chosen');
    } else if (repvar.available.indexOf(var_name) != -1) {
      circle_colour_key = 'available';
    } else if (repvar.ignored.indexOf(var_name) != -1) {
      circle_colour_key = 'ignored';
      circle.attr({'r':repvar.opts.sizes.big_marker_radius});
    } else {
      circle_colour_key = 'node';
    }
    changeNodeStateColour(var_name, circle, 'node_rest', circle_colour_key);
    circle.toFront();
    circle.attr({title: node.tooltip});
    node.label_mouseover.attr({title: node.tooltip});
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
    dist = repvar.variant_distance[var_name];
    if (dist) { // Not a chosen or ignored variant:
      new_path_str = getBarGraphPathStr(var_name, var_angle, dist);
      repvar.nodes[var_name].bar_chart.animate({path:new_path_str}, 200, 'linear');
    }
  }
}
function drawDistanceHistogram() {
  var margin = repvar.opts.graph.margin,
    total_width = repvar.opts.graph.total_width,
    total_height = repvar.opts.graph.total_height;
  repvar.graph.width = total_width - margin.right - margin.left;
  repvar.graph.height = total_height - margin.top - margin.bottom;
  // Set up svg objects:
  var svg = d3.select("#histoSvg")
    .attr("width", total_width)
    .attr("height", total_height);
  repvar.graph.g = svg.append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
  // Set up scales and data objects:
  repvar.graph.x_fxn = d3.scaleLinear()
    .rangeRound([0, repvar.graph.width]);
  repvar.graph.y_fxn = d3.scaleLinear()
    .range([0, repvar.graph.height])
    .clamp(true);
  // Graph title:
  /*svg.append("text")
    .attr("class", "histo-title")
    .attr("dy", "0.8em") //.attr("dy", ".35em")
    .attr("x", total_width / 2)
    .attr("text-anchor", "middle")
    .text("Distribution of distances");*/
  // Graph axes:
  repvar.graph.x_axis = d3.axisBottom(repvar.graph.x_fxn);
  repvar.graph.y_axis = d3.axisLeft(repvar.graph.y_fxn).tickValues([]).tickSize(0);
  repvar.graph.g.append("g")
    .attr("class", "x-axis")
    .attr("transform", "translate(0," + repvar.graph.height + ")");
  repvar.graph.g.append("g")
    .attr("class", "y-axis");
  var y_axis_vert_offset = 5, y_axis_horiz_offset = -6;
  repvar.graph.g.append("text") // y axis label
    .attr("class", "histo-axis-label")
    .attr("text-anchor", "middle")
    .attr("x", 0 - repvar.graph.height/2 - y_axis_vert_offset)
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
    max:repvar.nice_max_var_dist
  });
}

// =====  Event handlers and callbacks:
function addSingletonClusterObjRowHandlers(var_name, circle_obj, cluster_row) {
  // Adds an additional handler to each circle.mouseover and .mouseout; doesn't replace the existing handlers.
  circle_obj.mouseover(function() {
    cluster_row.css('background-color', repvar.opts.colours.cluster_highlight);
  }).mouseout(function() {
    cluster_row.css('background-color', '');
  });
  cluster_row.mouseenter(function() {
    cluster_row.css('background-color', repvar.opts.colours.cluster_highlight);
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
    if (!repvar.allow_select) { return true; }
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
  var cluster = repvar.clusters[var_name];
  cluster_row.css('background-color', repvar.opts.colours.cluster_highlight);
  cluster.cluster_obj.attr({fill:repvar.opts.colours.cluster_highlight_trans});
  for (var i=0; i<cluster.nodes.length; ++i) {
    nodeLabelMouseoverHandler(cluster.nodes[i], false);
  }
}
function clusterMouseoutHandler(var_name, cluster_row) {
  var cluster = repvar.clusters[var_name],
    orig_colour = repvar.opts.colours[cluster.colour_key];
  cluster_row.css('background-color', '');
  cluster.cluster_obj.attr({fill:orig_colour});
  for (var i=0; i<cluster.nodes.length; ++i) {
    nodeLabelMouseoutHandler(cluster.nodes[i]);
  }
}
function clusterMouseclickHandler(var_name) {
  var cluster = repvar.clusters[var_name];
  for (var i=0; i<cluster.nodes.length; ++i) {
    nodeLabelMouseclickHandler(cluster.nodes[i], false);
  }
  numSelectedCallback();
}
function numSelectedCallback() {
  $("#currentSelectionNum").html(repvar.num_selected);
}
function selectNamesByThreshold(threshold, select_below) {
  // Could implement a short-circuit in case the threshold hasn't changed.
  var threshold_val = [threshold, select_below], num_picked = 0, has_changed = false;
  if ( !(select_below && threshold == 0) &&
       !(!select_below && threshold == repvar.nice_max_var_dist) ) {
    $.each(repvar.variant_distance, function(var_name, dist) {
      if (select_below && dist <= threshold || !select_below && dist >= threshold) {
        num_picked += 1;
        if (repvar.considered_variants[var_name] == undefined) {
          nodeLabelMouseoverHandler(var_name);
          has_changed = true;
        }
        repvar.considered_variants[var_name] = threshold_val; // Add / update var_name in considered_variants.
      }
    });
  }
  var slider_keys = Object.keys(repvar.considered_variants), var_name;
  for (var i=0; i<slider_keys.length; ++i) {
    var_name = slider_keys[i];
    if (repvar.considered_variants[var_name] != threshold_val) {
      delete repvar.considered_variants[var_name];
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
function calculateHistoBins(max_var_dist) {
  // The upper bound of each bin is not inclusive.
  var x_fxn = d3.scaleLinear().domain([0, max_var_dist]);
  var x_ticks = x_fxn.ticks(repvar.opts.graph.histo_bins);
  if (max_var_dist >= x_ticks[x_ticks.length-1]) {
    x_ticks.push(x_ticks[x_ticks.length-1] + x_ticks[1]);
  }
  return x_ticks;
}
function updateHistoBins() {
  var x_ticks = calculateHistoBins(repvar.normalized_max_distance);
  repvar.nice_max_var_dist = x_ticks[x_ticks.length-1];
  repvar.graph.x_fxn.domain([0, repvar.nice_max_var_dist]); // Needed to include the final tick
  repvar.graph.bins = d3.histogram()
    .domain([0, repvar.normalized_max_distance])
    .thresholds(x_ticks)
    (Object.values(repvar.variant_distance));

  // If user has indicated a manual max y-value, either check to make sure it's not smaller than the max of the data here, or modify the bar height and text position so that they are capped at the max (prefer this option).
  var max_y = (repvar.normalized_max_count > 0) ? repvar.normalized_max_count : d3.max(repvar.graph.bins, function(d) { return d.length; });
  repvar.graph.y_fxn.domain([0, max_y]);

  var prev_ind = 0, cur_len;
  for (var i=0; i<repvar.graph.bins.length; ++i) {
    cur_len = repvar.graph.bins[i].length;
    repvar.graph.bins[i]['names'] = repvar.sorted_names.slice(prev_ind, prev_ind+cur_len);
    prev_ind += cur_len;
  }
  repvar.graph.x_ticks = x_ticks;
}
function updateHistoGraph() {
  var formatCount = d3.format(",.0f"),
    bin_range = repvar.graph.bins[0].x1 - repvar.graph.bins[0].x0,
    col_width = repvar.graph.x_fxn(bin_range),
    bar_margin = col_width * repvar.opts.graph.bar_margin_ratio / 2,
    bar_width = col_width - bar_margin * 2,
    init_bar_x = repvar.graph.width - bar_width;
  // The bars of the graph:
  var bar_elements = repvar.graph.g.selectAll(".histo-bar")
    .data(repvar.graph.bins);
  bar_elements.enter().append("rect")
    .attr("class", "histo-bar")
    .attr("x", init_bar_x)
    .attr("y", repvar.graph.height)
    .attr("width", bar_width)
    .attr("height", 0)
    .transition()
    .attr("height", function(d) { return repvar.graph.y_fxn(d.length); })
    .attr("transform", function(d) {
      return "translate(" + (repvar.graph.x_fxn(d.x0)+bar_margin-init_bar_x) + "," + (-repvar.graph.y_fxn(d.length)) + ")";
    });
  bar_elements.transition()
    .attr("x", init_bar_x)
    .attr("width", bar_width)
    .attr("height", function(d) { return repvar.graph.y_fxn(d.length); })
    .attr("transform", function(d) {
      return "translate(" + (repvar.graph.x_fxn(d.x0)+bar_margin-init_bar_x) + "," + (-repvar.graph.y_fxn(d.length)) + ")";
    });
  bar_elements.exit()
    .transition()
    .attr("height", 0)
    .attr("transform", "translate(0,0)")
    .remove();
  // The text label for each bar:
  var text_y_offset = 10,
    half_col = col_width / 2,
    init_text_x = repvar.graph.width - half_col,
    max_text_y = repvar.graph.height - text_y_offset;
  var bar_texts = repvar.graph.g.selectAll(".histo-text")
    .data(repvar.graph.bins);
  bar_texts.enter().append("text")
    .attr("class", "histo-text prevent-text-selection")
    .attr("x", init_text_x)
    .attr("y", max_text_y)
    .attr("dy", ".35em") // essentially a vertical-align: middle.
    .attr("text-anchor", "middle")
    .transition()
    .attr("transform", function(d) {
      return "translate(" + (repvar.graph.x_fxn(d.x0)+half_col-init_text_x) + "," + ( Math.min(2*text_y_offset-repvar.graph.y_fxn(d.length), 0) ) + ")";
    })
    .text(function(d) { return (d.length == 0) ? '' : formatCount(d.length); });
  bar_texts.transition()
    .attr("x", init_text_x)
    .attr("transform", function(d) {
      return "translate(" + (repvar.graph.x_fxn(d.x0)+half_col-init_text_x) + "," + ( Math.min(2*text_y_offset-repvar.graph.y_fxn(d.length), 0) ) + ")";
    })
    .text(function(d) { return (d.length == 0) ? '' : formatCount(d.length); });
  bar_texts.exit().remove();
  // A transparent full-sized rect on top to capture mouse events:
  var bar_mouseovers = repvar.graph.g.selectAll(".histo-overlay")
    .data(repvar.graph.bins);
  bar_mouseovers.enter().append("rect")
    .attr("class", "histo-overlay")
    .attr("x", function(d) { return repvar.graph.x_fxn(d.x0); })
    .attr("width", col_width)
    .attr("height", repvar.graph.height)
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
  .attr("x", function(d) { return repvar.graph.x_fxn(d.x0); });
  bar_mouseovers.exit().remove();
}
function updateHistoAxes() {
  repvar.graph.x_axis.tickValues(repvar.graph.x_ticks)
    .tickFormat(d3.format(".3")); // trims trailing zeros
  repvar.graph.g.select(".x-axis")
    .transition()
    .call(repvar.graph.x_axis)
    .selectAll("text")
      .style("text-anchor", "start")
      .attr("x", 7)
      .attr("y", 5)
      .attr("dy", ".35em")
      .attr("transform", "rotate(55)");
  repvar.graph.g.select(".y-axis")
    .transition()
    .call(repvar.graph.y_axis);
}

// =====  Data parsing:
function parseRepvarData(data_obj) {
  var data = $.parseJSON(data_obj);
  page.session_id = data.session_id;
  repvar.tree_data = data.phyloxml_data;
  repvar.leaves = data.leaves;
  repvar.lc_leaves = {};
  var name;
  for (var i=0; i<data.leaves.length; ++i) {
    name = data.leaves[i];
    repvar.lc_leaves[name.toLowerCase()] = name;
  }
  repvar.ignored = data.ignored;
  repvar.available = data.available;
  if (data.hasOwnProperty('maintain_interval') && data.maintain_interval != page.maintain_interval*1000) {
    maintainServer();
    page.maintain_interval = data.maintain_interval * 1000;
    clearInterval(page.maintain_interval_obj);
    page.maintain_interval_obj = setInterval(maintainServer, page.maintain_interval);
  }
}
function parseClusteredData(data) {
  if (data.variants.length != repvar.num_variants) {
    showErrorPopup("Error: data appears to be corrupted (num_variants and variants disagree).");
    return false;
  }
  repvar.variant_distance = data.variant_distance;
  repvar.max_variant_distance = data.max_variant_distance;
  repvar.original_bins = calculateHistoBins(data.max_variant_distance);

  // Check if a normalization is already set (from the server). Else:
  repvar.normalized_max_distance = data.normalization.value;
  repvar.normalized_max_count = data.normalization.max_count;
  if (data.normalization.method == 'global') {
    $("#normGlobalRadio").prop('checked', true);
    $("#normGlobalValSpan").html('['+roundFloat(data.normalization.value, 4)+']');
  } else if (data.normalization.method == 'custom') {
    $("#normValRadio").prop('checked', true);
    $("#normValInput").val(data.normalization.value);
  }

  repvar.variants = data.variants;
  repvar.sorted_names = Object.keys(repvar.variant_distance).sort(function(a,b) {
    return repvar.variant_distance[a] - repvar.variant_distance[b];
  });

  repvar.clusters = {};
  for (var i=0; i<repvar.variants.length; ++i) {
    repvar.clusters[repvar.variants[i]] = {'score':data.scores[i], 'nodes':data.clusters[i], 'cluster_obj':null, 'colour_key':''};
  }
}
