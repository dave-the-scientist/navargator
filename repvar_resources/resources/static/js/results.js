// core.js then core_tree_functions.js are loaded before this file.

// This page is loaded, then continually checks with the server to see if the results are ready yet. It might be better (probably not) to use a Flask socket, that allows either the server or client to initiate communication. Good explanation here https://www.shanelynn.ie/asynchronous-updates-to-a-webpage-with-flask-and-socket-io/


// =====  Modified / additional common variables:
page.check_results_interval = 1000;
repvar.num_variants = null, repvar.variants = [], repvar.clusters = {}, repvar.variant_distance = {}, repvar.max_variant_distance = 0.0, repvar.nice_max_var_dist = 0.0;
repvar.opts.histo = {
  'height':null, 'margin':{top:0, right:17, bottom:30, left:7}, // top:17 if generating a title
  'bar_margin_ratio':0.15, 'bins':15 // Approximate # bins.
};

//TODO:
// - Get export buttons working.
// - I need to put an options pane. Probably between summary and export panes.
//   - Global normalization option, hide sequence names, as well as various color pickers and size spinners (these are in a collapsing pane).
// - Update histo slider buttons.
//   - Left should not toggle selection, but force into selection. Once pressed, should switch to 'Remove from selection': # nodes. Should revert back to 'Add' once the set of indicated (prevent_mouseout) nodes changes.
//   - Middle button should be 'Nodes below' or 'Nodes above'. Would be nice for it to animate on change (have text move slightly to the right, and '<<' arrow appear on left; just like at https://www.w3schools.com/howto/howto_css_animate_buttons.asp).
//   - Right button is 'Reset'
// - I want the histo slider to update in real-time.
//   - Ready now, just want a more efficient selectNamesByThreshold().
//   - Should have a data structure that has each node sorted by score, knows the previous call, and the dist the next node is at. Then when it gets called, it checks the new threshold against the 'next node'. If its not there yet, it does nothing. Otherwise processes nodes until it hits the new threshold.
//   - The point is that I don't want to be continualy iterating through the object from beginning to current. This way subsequent iterations start where the previous call left off.
// - Option to normalize bar graph heights against max value in the tree, or against the max value from all repvar runs in the cache. Or against a custom value (would let you compare between different 'available' sets).
//   - Though this wouldn't update if you ran new ones. It would also require an ajax call on activation (not a problem).
//   - Should also re-draw the histogram with the new max_variant_distance, so you can compare histos between results.

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
  var tree_width_str = getComputedStyle(document.getElementById("mainTreeDiv")).getPropertyValue("--tree-width");
  repvar.opts.sizes.tree = parseInt(tree_width_str.slice(0,-2));
  var histo_height = getComputedStyle(document.getElementById("histoSvg")).getPropertyValue("height");
  repvar.opts.histo.height = parseInt(histo_height.slice(0,-2));
  document.title = '['+repvar.num_variants+'] ' + document.title;

  maintainServer();
  page.maintain_interval_obj = setInterval(maintainServer, page.maintain_interval);
  setupHistoSliderPane();
  setupSelectionPane();
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
      drawTree();
      checkForClusteringResults();
    },
    error: function(error) { processError(error, "Error loading input data from the server"); }
  });
}
function setupHistoSliderPane() {
  var left = $("#leftSliderButton"), middle = $("#middleSliderButton"), right = $("#rightSliderButton"),
    slider_handle = $("#histoSliderHandle");
  var slider = $("#histoSlider").slider({
    range: "min",
    min: 0, max: 1.0,
    value: 0, step: 0.001,
    create: function() {
      $("#histoSliderHandle").text($(this).slider("value"));
    },
    slide: function(event, ui) {
      $("#histoSliderHandle").text(ui.value);
    },
    stop: function(event, ui) {
      selectNamesByThreshold(ui.value, slider.slider('option', 'range') == 'min');
    }
  });
  left.click(function() {
    var slider_keys = Object.keys(repvar.prevent_mouseout), var_name;
    for (var i=0; i<slider_keys.length; ++i) {
      var_name = slider_keys[i];
      nodeLabelMouseclickHandler(var_name, false);
    }
    numSelectedCallback();
  });
  middle.click(function() {
    var select_below = slider.slider('option', 'range') == 'min',
      slider_val = slider.slider('value');
    if (slider_val == 0) { slider_val = repvar.nice_max_var_dist; }
    else if (slider_val == repvar.nice_max_var_dist) { slider_val = 0; }
    if (select_below) { // Switch to above
      slider.slider('option', 'range', 'max');
      middle.html('Nodes<br>above');
    } else { // Switch to below
      slider.slider('option', 'range', 'min');
      middle.html('Nodes<br>below');
    }
    slider.slider('value', slider_val);
    slider_handle.text(slider_val);
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

console.log('results.js has been loaded');
$(window).on("load", function() {
  // Sometimes $(document).ready is triggered, but this is not.
  console.log('window loaded');
});
$(document).ready(function(){
  // Occassionally this is never called (no 'setting up' in log; also, no errors). If it was because jQuery wasn't loaded in time, I should get an error. Instead, I think the page is loading too quickly, and the 'ready' event fires before results.js has finished loading. $(window).on("load") doesn't get called either.
  console.log('setting up');
  // Called once the document has loaded.
  setTimeout(setupPage, 10); // setTimeout is used because otherwise the setInterval call sometimes hangs. I think it's due to the page not being ready when the call happens.
  console.log('called setup');
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
  var max_var_name_length = 15, dec_precision = 4, name_td;
  var short_name = var_name.slice(0, max_var_name_length),
    clstr_size = repvar.clusters[var_name].nodes.length,
    clstr_score = repvar.clusters[var_name].score,
    clstr_avg_score = roundFloat(clstr_score/clstr_size, dec_precision),
    score_90th = roundFloat(calculate90Percentile(repvar.clusters[var_name].nodes), dec_precision);
  if (var_name == short_name) {
    name_td = "<td>"+short_name+"</td>";
  } else {
    name_td = "<td title='"+var_name+"'>"+short_name+"</td>";
  }
  var size_td = "<td>"+clstr_size+"</td>",
    avg_dist_td = "<td>"+clstr_avg_score+"</td>",
    score_td = "<td>"+score_90th+"</td>";
    return $("<tr class='cluster-list-row' variant-name='" +var_name+ "'>" +name_td +size_td +avg_dist_td +score_td+ "</tr>");
}
function updateClusteredVariantMarkers() {
  // Colours the representative, available, and ignored nodes.
  var var_name, circle, circle_colour_key;
  for (var i=0; i<repvar.leaves.length; ++i) {
    var_name = repvar.leaves[i];
    circle = repvar.nodes[var_name].circle;
    if (repvar.variants.indexOf(var_name) != -1) {
      circle_colour_key = (repvar.clusters[var_name].nodes.length > 1) ? 'chosen' : 'singleton_cluster_background';
      circle.attr({'r':repvar.opts.sizes.big_marker_radius});
      changeNodeStateColour(var_name, repvar.nodes[var_name].label_highlight, 'label_mouseover', 'chosen');
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
    circle.attr({title:repvar.nodes[var_name].tooltip});
  }
}

// =====  Event handlers and callbacks:
function addSingletonClusterObjRowHandlers(var_name, circle_obj, cluster_row) {
  // Adds an additional handler to each circle.mouseover and .mouseout; doesn't replace the existing handlers.
  /* TEST
  cluster_obj.unmouseout(nodeLabelMouseoutHandler); // Doesn't work for some reason.
  // Currently keeps the nodeLabel mouseover/out/click handlers. Use this to remove them:
  for (var event_i=0; event_i<cluster_obj.events.length; ++event_i) {
    cluster_obj.events[event_i].unbind();
  }
  delete cluster_obj.events;*/
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
  var threshold_val = [threshold, select_below], num_picked = 0;
  if ( !(select_below && threshold == 0) &&
       !(!select_below && threshold == repvar.nice_max_var_dist) ) {
    $.each(repvar.variant_distance, function(var_name, dist) {
      if (select_below && dist <= threshold || !select_below && dist >= threshold) {
        num_picked += 1;
        if (repvar.prevent_mouseout[var_name] == undefined) {
          nodeLabelMouseoverHandler(var_name);
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
    }
  }
  if (num_picked == 0) {
    $("#numSliderSpan").hide();
  } else {
    $("#numSliderSpan").html(num_picked+' nodes');
    $("#numSliderSpan").show();
  }
}
function colourSelectionChange(choice) {
  console.log('picked', choice);
}
function colourSelectPicked(jscol) {
  console.log('chose', '#'+jscol);
}

// =====  Graph functions:
function drawDistanceHistogram() {
  var margin = repvar.opts.histo.margin;
  var total_width_str = getComputedStyle(document.getElementById("selectionDiv")).getPropertyValue("width"),
    total_width = parseInt(total_width_str.slice(0,-2)), width = total_width - margin.right - margin.left,
    total_height = repvar.opts.histo.height, height = total_height - margin.top - margin.bottom;
  // Set up svg objects:
  var svg = d3.select("#histoSvg")
    .attr("width", total_width)
    .attr("height", total_height);
  var g = svg.append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
  // Set up scales and data objects:
  var x = d3.scaleLinear()
    .domain([0, repvar.max_variant_distance])
    .rangeRound([0, width]);
  var x_ticks = x.ticks(repvar.opts.histo.bins),
    max_x_tick = x_ticks[x_ticks.length-1] + x_ticks[1];
  repvar.nice_max_var_dist = roundFloat(max_x_tick, 4);
  x_ticks.push(max_x_tick);
  x.domain([0, max_x_tick]); // Needed so that the final bin is included in the graph.
  var bins = d3.histogram()
    .domain([0, repvar.max_variant_distance]) // Cannot be x.domain()
    .thresholds(x.ticks(x_ticks.length))
    (Object.values(repvar.variant_distance));
  var y = d3.scaleLinear()
    .domain([0, d3.max(bins, function(d) { return d.length; })])
    .range([0, height]);
  var var_names = Object.keys(repvar.variant_distance).sort(function(a,b) {
    return repvar.variant_distance[a] - repvar.variant_distance[b];
  }), prev_ind = 0, cur_len;
  for (var i=0; i<bins.length; ++i) {
    cur_len = bins[i].length;
    bins[i]['names'] = var_names.slice(prev_ind, prev_ind+cur_len);
    prev_ind += cur_len;
  }
  // Add a column g to hold each bar:
  var bar = g.selectAll(".histo-bar")
  .data(bins)
  .enter().append("g")
    .attr("transform", function(d) { return "translate(" + x(d.x0) + ",0)"; });
  // Draw the bars and label them:
  var formatCount = d3.format(",.0f"),
    bin_range = bins[0].x1 - bins[0].x0,
    bar_width = x(bin_range),
    bar_margin = bar_width * repvar.opts.histo.bar_margin_ratio;
  bar.append("rect")
    .attr("class", "histo-bar")
    .attr("x", bar_margin / 2)
    .attr("width", bar_width - bar_margin)
    .attr("height", function(d) { return y(d.length); })
    .attr("transform", function(d) { return "translate(0,"+(height - y(d.length))+")"; });
  bar.append("text")
    .attr("class", "histo-text")
    .attr("dy", ".35em")
    .attr("y", function(d) { return height - Math.max(y(d.length)-10, 10); }) // So text doesn't overlap axis
    .attr("x", bar_width / 2)
    .attr("text-anchor", "middle")
    .text(function(d) { return (d.length == 0) ? '' : formatCount(d.length); });
  bar.append("rect")
    .attr("width", bar_width)
    .attr("height", height)
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
  // Draw the title and axes:
  /*svg.append("text")
    .attr("class", "histo-title")
    .attr("dy", "0.8em") //.attr("dy", ".35em")
    .attr("x", total_width / 2)
    .attr("text-anchor", "middle")
    .text("Distribution of distances");*/
  g.append("g")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(x).tickValues(x_ticks))
    .selectAll("text")
      .style("text-anchor", "start")
      .attr("x", 7)
      .attr("y", 5)
      .attr("dy", ".35em")
      .attr("transform", "rotate(55)");
  g.append("g")
    .call(d3.axisLeft(y).tickValues([]).tickSize(0));
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
  repvar.variants = data.variants;
  repvar.clusters = {};
  for (var i=0; i<repvar.variants.length; ++i) {
    repvar.clusters[repvar.variants[i]] = {'score':data.scores[i], 'nodes':data.clusters[i], 'cluster_obj':null, 'colour_key':''};
  }
}
