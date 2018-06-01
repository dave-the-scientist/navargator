// core.js then core_tree_functions.js are loaded before this file.

// This page is loaded, then continually checks with the server to see if the results are ready yet. It might be better (probably not) to use a Flask socket, that allows either the server or client to initiate communication. Good explanation here https://www.shanelynn.ie/asynchronous-updates-to-a-webpage-with-flask-and-socket-io/


// =====  Modified / additional common variables:
page.check_results_interval = 1000;
repvar.num_variants = null, repvar.variants = [], repvar.clusters = {}, repvar.variant_distance = {}, repvar.max_variant_distance = 0.0, repvar.normalized_max_distance = 0.0, repvar.nice_max_var_dist = 0.0, repvar.sorted_names = [];
repvar.opts.histo = {
  'height':null, 'margin':{top:0, right:17, bottom:30, left:7}, // top:17 if generating a title
  'bar_margin_ratio':0.15, 'bins':15 // Approximate # bins.
};

//TODO:
// - Histo slider doesnt yet update to repvar.normalized_max_distance. Also, clean up graph drawing code (and move to appropriate parts of the file).
// - The 'No normalization' line should display the max distance for this run. The 'normalize across runs' line should display what that value is (helps user know for sure they're comparing the same thing).
// - Get export buttons working.
// - Global normalization option, hide sequence names, as well as various color pickers and size spinners (these are in a collapsing pane).
// - Need a more efficient selectNamesByThreshold().
//   - Should have a data structure that has each node sorted by score, knows the previous call, and the dist the next node is at. Then when it gets called, it checks the new threshold against the 'next node'. If its not there yet, it does nothing. Otherwise processes nodes until it hits the new threshold.
//   - The point is that I don't want to be continualy iterating through the object from beginning to current. This way subsequent iterations start where the previous call left off.
// - Option to normalize bar graph heights against max value in the tree, or against the max value from all repvar runs in the cache. Or against a custom value (would let you compare between different 'available' sets).
//   - Though this wouldn't update if you ran new ones. It would also require an ajax call on activation (not a problem).
//   - Should also re-draw the histogram with the new max_variant_distance, so you can compare histos between results.
// - In summary statistics pane should indicate which clustering method was used, and give any relevant info (like support for the pattern if k-medoids, etc).
// - Change mentions of 'node' to 'variant'.
// - I don't love the singleton cluster colour of dark blue. Maybe a red/orange would be better. Want them to jump out, and having negative connotations is good.
// - Is repvar.nice_max_var_dist useful?

//NOTE:
// - If you normalize to a value smaller than the current max, any variants with a distance greater than that will all have the same sized bar graph (it's capped). Further, they will not be counted on the histogram.

// =====  Page setup:
function setupPage() {
  $(".jq-ui-button").button(); // Converts these html buttons into jQuery-themed buttons. Provides style and features, including .button('disable')
  $("#errorDialog").dialog({modal:true, autoOpen:false,
    buttons:{Ok:function() { $(this).dialog("close"); }}
  }); // Sets up error dialog, which is hidden until called with showErrorPopup(message, title).

  var url_params = location.search.slice(1).split('_');
  page.session_id = url_params[0];
  repvar.num_variants = url_params[1];
  page.browser_id = generateBrowserId(10);
  console.log('browser ID:', page.browser_id);
  var tree_width_str = $("#mainTreeDiv").css('width');
  repvar.opts.sizes.tree = parseInt(tree_width_str.slice(0,-2));
  var histo_height = $("#histoSvg").css('height');
  repvar.opts.histo.height = parseInt(histo_height.slice(0,-2));
  document.title = '['+repvar.num_variants+'] ' + document.title;

  maintainServer();
  page.maintain_interval_obj = setInterval(maintainServer, page.maintain_interval);
  setupHistoSliderPane();
  setupSelectionPane();
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
  var mid_offset = middle_span.css('left'), animation_speed = 150, mid_left_arrow = $("#midLeftArrow"), mid_right_arrow = $("#midRightArrow");
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
      /*if (selectNamesByThreshold(ui.value, slider.slider('option', 'range') == 'min') == true
          && do_remove == true) {
        setButtonAddToSelection();
      }*/
    }
  });
  left.click(function() {
    var slider_keys = Object.keys(repvar.prevent_mouseout), var_name;
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
      middle_span.animate({left: '-'+mid_offset}, animation_speed);
      mid_left_arrow.animate({opacity:0}, animation_speed);
      mid_right_arrow.animate({opacity:1}, animation_speed);
    } else { // Switch to below
      slider.slider('option', 'range', 'min');
      middle_span.html('Variants<br>below');
      middle_span.animate({left: mid_offset}, animation_speed);
      mid_left_arrow.animate({opacity:1}, animation_speed);
      mid_right_arrow.animate({opacity:0}, animation_speed);
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
  $("#selectAllButton").click(function() {
    $.each(repvar.variant_distance, function(var_name, dist) {
      nodeLabelMouseclickHandler(var_name, false, true);
    });
    numSelectedCallback();
  });
  $("#clearSelectionButton").click(function() {
    $.each(repvar.selected, function(var_name, colour) {
      nodeLabelMouseclickHandler(var_name, false, false);
    });
    numSelectedCallback();
  });
  $("#clearColoursButton").click(function() {

  });
}
function setupDisplayOptionsPane() {
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
    normalizeResults();
  });
  global_radio.on("change", function(event) {
    hideGoButton();
    // ajax to get it.
    // on success, repvar.normalized_max_distance = val, then normalizeResults();
  });
  custom_radio.click(function(event) {
    var val = custom_input.val();
    if (val == '') {
      custom_input.focus();
      return false; // Prevents the button from being actually selected.
    }
  }).on("change", function(event) {
    repvar.normalized_max_distance = custom_input.val();
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
        drawBarGraphs();
        updateSummaryStats();
        drawClusters();
        updateClusteredVariantMarkers(); // Must be after drawBarGraphs and drawClusters
        drawDistanceHistogram();
        updateHistoSlider(); // Must be after drawDistanceHistogram
      }
    },
    error: function(error) { processError(error, "Error getting clustering data from the server"); }
  });
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
function updateHistoSlider() {
  $("#histoSlider").slider({
    max:repvar.nice_max_var_dist
  });
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
      repvar.clusters[var_name].colour_key = 'cluster_background';
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
  // Colours the representative, available, and ignored nodes. Also adds tooltips to
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
  cluster.cluster_obj.attr({fill:repvar.opts.colours.cluster_highlight});
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
        if (repvar.prevent_mouseout[var_name] == undefined) {
          nodeLabelMouseoverHandler(var_name);
          has_changed = true;
        }
        repvar.prevent_mouseout[var_name] = threshold_val; // Add / update var_name in prevent_mouseout.
      }
    });
  }
  var slider_keys = Object.keys(repvar.prevent_mouseout), var_name;
  for (var i=0; i<slider_keys.length; ++i) {
    var_name = slider_keys[i];
    if (repvar.prevent_mouseout[var_name] != threshold_val) {
      delete repvar.prevent_mouseout[var_name];
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
function colourSelectionChange(choice) {
  console.log('picked', choice);
}
function colourSelectPicked(jscol) {
  console.log('chose', '#'+jscol);
}

// =====  Graph functions:
repvar.graph = {'width':null, 'height':null, 'g':null, 'x_fxn':null, 'y_fxn':null, 'bins':null, 'x_axis':null, 'y_axis':null};
function updateHistogram() {
  var x_ticks = updateHistoBins();
  updateHistoGraph();
  updateHistoAxes(x_ticks);
}
function updateHistoBins() {
  repvar.graph.x_fxn.domain( [0, repvar.normalized_max_distance] );
  var x_ticks = repvar.graph.x_fxn.ticks(repvar.opts.histo.bins),
    max_x_tick = x_ticks[x_ticks.length-1] + x_ticks[1];
  repvar.nice_max_var_dist = roundFloat(max_x_tick, 4);
  x_ticks.push(max_x_tick);
  repvar.graph.x_fxn.domain([0, max_x_tick]); // Needed so that the final bin is included in the graph.
  repvar.graph.bins = d3.histogram()
    .domain([0, repvar.normalized_max_distance]) // Cannot be repvar.graph.x_fxn.domain()
    .thresholds(repvar.graph.x_fxn.ticks(x_ticks.length))
    (Object.values(repvar.variant_distance));
  repvar.graph.y_fxn.domain( [0, d3.max(repvar.graph.bins, function(d) { return d.length; })] );
  var prev_ind = 0, cur_len;
  for (var i=0; i<repvar.graph.bins.length; ++i) {
    cur_len = repvar.graph.bins[i].length;
    repvar.graph.bins[i]['names'] = repvar.sorted_names.slice(prev_ind, prev_ind+cur_len);
    prev_ind += cur_len;
  }
  return x_ticks;
}
function updateHistoGraph() {
  var formatCount = d3.format(",.0f"),
    bin_range = repvar.graph.bins[0].x1 - repvar.graph.bins[0].x0,
    bar_width = repvar.graph.x_fxn(bin_range),
    bar_margin = bar_width * repvar.opts.histo.bar_margin_ratio;

  var bar_elements = repvar.graph.g.selectAll(".histo-bar")
    .data(repvar.graph.bins);
  bar_elements.enter().append("rect")
    .attr("class", "histo-bar")
    .attr("x", repvar.graph.width)
    .attr("y", repvar.graph.height)
    .attr("width", bar_width - bar_margin)
    .attr("height", 0)
    .transition()
    .attr("height", function(d) { return repvar.graph.y_fxn(d.length); })
    .attr("transform", function(d) {
      return "translate(" + (repvar.graph.x_fxn(d.x0)+bar_margin/2-repvar.graph.width) + "," + (-repvar.graph.y_fxn(d.length)) + ")";
    });
  bar_elements.transition()
    .attr("width", bar_width - bar_margin)
    .attr("height", function(d) { return repvar.graph.y_fxn(d.length); })
    .attr("transform", function(d) {
      return "translate(" + (repvar.graph.x_fxn(d.x0)+bar_margin/2-repvar.graph.width) + "," + (-repvar.graph.y_fxn(d.length)) + ")";
    });
  bar_elements.exit()
    .transition()
    .attr("height", 0)
    .attr("transform", "translate(0,0)")
    .remove();

  var bar_texts = repvar.graph.g.selectAll(".histo-text")
    .data(repvar.graph.bins);
  bar_texts.enter().append("text")
    .attr("class", "histo-text prevent-text-selection")
    .attr("x", repvar.graph.width)
    .attr("y", repvar.graph.height)
    .attr("dy", ".35em")
    .attr("text-anchor", "middle")
    .transition()
    .attr("x", function(d) { return repvar.graph.x_fxn(d.x0) + bar_width / 2; })
    .attr("y", function(d) { return repvar.graph.height - Math.max(repvar.graph.y_fxn(d.length)-10, 10); }) // So text doesn't overlap axis
    .text(function(d) { return (d.length == 0) ? '' : formatCount(d.length); });
  bar_texts.transition()
    .attr("x", function(d) { return repvar.graph.x_fxn(d.x0) + bar_width / 2; })
    .attr("y", function(d) { return repvar.graph.height - Math.max(repvar.graph.y_fxn(d.length)-10, 10); })
    .text(function(d) { return (d.length == 0) ? '' : formatCount(d.length); });
  bar_texts.exit().remove();
  // A transparent full-sized rect on top to capture mouse events:
  var bar_mouseovers = repvar.graph.g.selectAll(".histo-overlay")
    .data(repvar.graph.bins);
  bar_mouseovers.enter().append("rect")
    .attr("class", "histo-overlay")
    .attr("x", function(d) { return repvar.graph.x_fxn(d.x0); })
    .attr("width", bar_width)
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
  bar_mouseovers.attr("width", bar_width)
  .attr("x", function(d) { return repvar.graph.x_fxn(d.x0); });
  bar_mouseovers.exit().remove();
}
function updateHistoGraph_OLD() {
  var formatCount = d3.format(",.0f"),
    bin_range = repvar.graph.bins[0].x1 - repvar.graph.bins[0].x0,
    bar_width = repvar.graph.x_fxn(bin_range),
    bar_margin = bar_width * repvar.opts.histo.bar_margin_ratio;

  var bar_elements = repvar.graph.g.selectAll(".histo-bar-group")
    .data(repvar.graph.bins);

  bar_elements.exit().remove(); // The exit/updating isn't working yet.

  // Add a column g to hold each bar:
  var bar_groups = bar_elements.enter()
    .append("g")
    .attr("class", "histo-bar-group")
    .attr("transform", function(d) { return "translate(" + repvar.graph.x_fxn(d.x0) + ",0)"; });
  // Draw the bars and label them:
  bar_groups.append("rect")
    .attr("class", "histo-bar")
    .attr("x", bar_margin / 2)
    .attr("width", bar_width - bar_margin)
    .attr("height", function(d) { return repvar.graph.y_fxn(d.length); })
    .attr("transform", function(d) { return "translate(0,"+(repvar.graph.height - repvar.graph.y_fxn(d.length))+")"; });
  bar_groups.append("text")
    .attr("class", "histo-text prevent-text-selection")
    .attr("dy", ".35em")
    .attr("y", function(d) { return repvar.graph.height - Math.max(repvar.graph.y_fxn(d.length)-10, 10); }) // So text doesn't overlap axis
    .attr("x", bar_width / 2)
    .attr("text-anchor", "middle")
    .text(function(d) { return (d.length == 0) ? '' : formatCount(d.length); });
  // A transparent full-sized rect on top to capture mouse events:
  bar_groups.append("rect")
    .attr("width", bar_width)
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
}
function updateHistoAxes(x_ticks) {
  repvar.graph.x_axis.tickValues(x_ticks);
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
function drawDistanceHistogram() {
  var margin = repvar.opts.histo.margin;
  var total_width_str = getComputedStyle(document.getElementById("selectionDiv")).getPropertyValue("width"),
    total_width = parseInt(total_width_str.slice(0,-2)),
    total_height = repvar.opts.histo.height;
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
    .range([0, repvar.graph.height]);
  var x_ticks = updateHistoBins();

  updateHistoGraph();

  // Draw the title and axes:
  /*svg.append("text")
    .attr("class", "histo-title")
    .attr("dy", "0.8em") //.attr("dy", ".35em")
    .attr("x", total_width / 2)
    .attr("text-anchor", "middle")
    .text("Distribution of distances");*/
  repvar.graph.x_axis = d3.axisBottom(repvar.graph.x_fxn);
  repvar.graph.y_axis = d3.axisLeft(repvar.graph.y_fxn).tickValues([]).tickSize(0);
  repvar.graph.g.append("g")
    .attr("class", "x-axis")
    .attr("transform", "translate(0," + repvar.graph.height + ")");
  repvar.graph.g.append("g")
    .attr("class", "y-axis");

  updateHistoAxes(x_ticks);
}
function drawDistanceHistogram_OLD() {
  var margin = repvar.opts.histo.margin;
  var total_width_str = getComputedStyle(document.getElementById("selectionDiv")).getPropertyValue("width"),
    total_width = parseInt(total_width_str.slice(0,-2)),
    total_height = repvar.opts.histo.height;
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
    .range([0, repvar.graph.height]);
  var x_ticks = updateHistoBins();

  updateHistoGraph();

  // Draw the title and axes:
  /*svg.append("text")
    .attr("class", "histo-title")
    .attr("dy", "0.8em") //.attr("dy", ".35em")
    .attr("x", total_width / 2)
    .attr("text-anchor", "middle")
    .text("Distribution of distances");*/
  repvar.graph.x_axis = d3.axisBottom(repvar.graph.x_fxn);
  repvar.graph.y_axis = d3.axisLeft(repvar.graph.y_fxn).tickValues([]).tickSize(0);
  repvar.graph.g.append("g")
    .attr("class", "x-axis")
    .attr("transform", "translate(0," + repvar.graph.height + ")");
  repvar.graph.g.append("g")
    .attr("class", "y-axis");

  updateHistoAxes(x_ticks);
  /*repvar.graph.g.append("g")
    .attr("class", "x-axis")
    .attr("transform", "translate(0," + repvar.graph.height + ")")
    .call(repvar.graph.x_axis)
    .selectAll("text")
      .style("text-anchor", "start")
      .attr("x", 7)
      .attr("y", 5)
      .attr("dy", ".35em")
      .attr("transform", "rotate(55)");
  repvar.graph.g.append("g")
    .attr("class", "y-axis")
    .call(repvar.graph.y_axis);*/
}

// =====  Data parsing:
function parseRepvarData(data_obj) {
  var data = $.parseJSON(data_obj);
  page.session_id = data.session_id;
  repvar.tree_data = data.phyloxml_data;
  repvar.leaves = data.leaves;
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
  // Check if a normalization is already set (from the server). Else:
  repvar.normalized_max_distance = data.max_variant_distance;
  repvar.variants = data.variants;
  repvar.sorted_names = Object.keys(repvar.variant_distance).sort(function(a,b) {
    return repvar.variant_distance[a] - repvar.variant_distance[b];
  });

  repvar.clusters = {};
  for (var i=0; i<repvar.variants.length; ++i) {
    repvar.clusters[repvar.variants[i]] = {'score':data.scores[i], 'nodes':data.clusters[i], 'cluster_obj':null, 'colour_key':''};
  }
}
