// core.js then core_tree_functions.js are loaded before this file.

// This page is loaded, then continually checks with the server to see if the results are ready yet. It might be better (probably not) to use a Flask socket, that allows either the server or client to initiate communication. Good explanation here https://www.shanelynn.ie/asynchronous-updates-to-a-webpage-with-flask-and-socket-io/


// =====  Modified common variables:
page.check_results_interval = 1000;
repvar.num_variants = null, repvar.variants = [], repvar.clusters = {}, repvar.variant_distance = {}, repvar.max_variant_distance = 0.0;
repvar.opts.histo = {
  'height':150, 'margin':{top:17, right:17, bottom:30, left:7},
  'bar_margin_ratio':0.15, 'bins':15 //Approximately
};


//TODO:
// - Consider removing histo title, and instead use a <h2>.
// - In cluster list, only long names that have been cropped should have a mouseover hover text. otherwise it's annoying.
// - On mouseover of histo, might want to highlight the node too, not just the label.
// - Below histo, I want a selection area.
//   - There's a slider the width of the histo, with a button on either end. Click the left button, and it selects everything with a score lower than the slider (and highlights em). Click right button, and it's everything with a higher score. Or perhaps the slider just has 2 handles. That would let you pick a middle selection for some reason.
//   - Clicking on a histo bar should select those sequences.
//   - Should display how many seqs are currently selected, have a 'clear' button, and an option to save them to file.
// - Option to normalize bar graph heights against max value in the tree, or against the max value from all repvar runs in the cache. Or against a custom value (would let you compare between different 'available' sets).
//   - Though this wouldn't update if you ran new ones. It would also require an ajax call on activation (not a problem).
//   - Should also re-draw the histogram with the new max_variant_distance, so you can compare histos between results.

// =====  Page setup:
function setupPage() {
  $(".jq-ui-button").button(); // Converts these html buttons into jQuery-themed buttons. Provides style and features, including .button('disable')
  $("#errorDialog").dialog({modal:true, autoOpen:false,
    buttons:{Ok:function() { $(this).dialog("close"); }}
  });
  var url_params = location.search.slice(1).split('_');
  page.session_id = url_params[0];
  repvar.num_variants = url_params[1];
  page.browser_id = generateBrowserId(10);
  console.log('browser ID:', page.browser_id);

  var tree_width_str = getComputedStyle(document.getElementById("mainTreeDiv")).getPropertyValue("--tree-width");
  repvar.opts.sizes.tree = parseInt(tree_width_str.slice(0,-2));
  document.title = '['+repvar.num_variants+'] '+document.title;

  maintainServer();
  page.maintain_interval_obj = setInterval(maintainServer, page.maintain_interval);
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
$(document).ready(function(){
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
        updateClusterList();
        updateClusteredVariantMarkers(); // Must be after drawBarGraphs and drawClusters
        drawDistanceHistogram();
      }
    },
    error: function(error) { processError(error, "Error getting clustering data from the server"); }
  });
}
function updateSummaryStats() {
  var cluster_dist = 0.0, node_dist = 0.0;
  for (var i=0; i<repvar.variants.length; ++i) {
    cluster_dist += repvar.clusters[repvar.variants[i]].score;
  }
  $("#distTotalSpan").html(roundFloat(cluster_dist, 4));
  cluster_dist = roundFloat(cluster_dist/repvar.variants.length, 4);
  $.each(repvar.variant_distance, function(var_name, dist) {
    node_dist += dist;
  });
  node_dist = roundFloat(node_dist/Object.keys(repvar.variant_distance).length, 4);
  $("#distClustersSpan").html(cluster_dist);
  $("#distNodesSpan").html(node_dist);
}
function drawClusters() {
  var var_names;
  var_names = repvar.variants.slice();
  var_names.sort(function(a,b) {
    return repvar.clusters[a].nodes.length - repvar.clusters[b].nodes.length;
  });
  var var_name, ret, cluster_obj, mouseover_obj;
  for (var i=0; i<var_names.length; ++i) {
    var_name = var_names[i];
    ret = drawClusterObject(repvar.clusters[var_name].nodes);
    cluster_obj = ret[0];
    mouseover_obj = ret[1];
    if (mouseover_obj == false) { // Singleton cluster
      addClusterObjHandlers(cluster_obj, var_name);
    } else { // Non singleton cluster
      addClusterObjHandlers(mouseover_obj, var_name);
    }
    repvar.clusters[var_name].cluster_obj = cluster_obj;
  }
  repvar.tree_background.toBack();
}
function updateClusterList() {
  var max_var_name_length = 15;
  var var_name, short_name, clstr_size, clstr_score, clstr_avg_score, name_td, size_td, avg_dist_td, score_td,
    cluster_row, table_body = $("#clustersListTable > tbody");
  for (var i=0; i<repvar.variants.length; ++i) {
    var_name = repvar.variants[i];
    short_name = var_name.slice(0, max_var_name_length);
    clstr_size = repvar.clusters[repvar.variants[i]].nodes.length;
    clstr_score = repvar.clusters[repvar.variants[i]].score;
    clstr_avg_score = roundFloat(clstr_score/clstr_size, 4);
    clstr_score = roundFloat(clstr_score, 4);
    name_td = "<td title='"+var_name+"'>"+short_name+"</td>";
    size_td = "<td>"+clstr_size+"</td>";
    avg_dist_td = "<td>"+clstr_avg_score+"</td>";
    score_td = "<td>"+clstr_score+"</td>";
    cluster_row = $("<tr class='cluster-list-row' variant-name='"+var_name+"'>"+name_td+size_td+avg_dist_td+score_td+"</tr>");
    table_body.append(cluster_row);
  }
  addClusterRowHandlers();
}
function updateClusteredVariantMarkers() {
  // Colours the representative, available, and ignored nodes.
  var var_name, circle, colour_key;
  for (var i=0; i<repvar.leaves.length; ++i) {
    var_name = repvar.leaves[i];
    circle = repvar.nodes[var_name].circle;
    if (repvar.variants.indexOf(var_name) != -1) {
      colour_key = circle['repvar-colour-key'] ? circle['repvar-colour-key'] : 'chosen';
      circle.attr({fill:repvar.opts.colours[colour_key], 'r':repvar.opts.sizes.big_marker_radius});
      repvar.nodes[var_name].label_highlight.attr({fill: repvar.opts.colours.chosen});
    } else if (repvar.available.indexOf(var_name) != -1) {
      circle.attr({fill:repvar.opts.colours.available});
    } else if (repvar.ignored.indexOf(var_name) != -1) {
      circle.attr({fill:repvar.opts.colours.ignored, 'r':repvar.opts.sizes.big_marker_radius});
    }
    circle.toFront();
    circle.attr({title:repvar.nodes[var_name].tooltip});
    addNodeObjHandlers(circle, var_name);
  }
}

// =====  Event handlers:
function addClusterObjHandlers(cluster_obj, var_name) {
  cluster_obj.mouseover(function() {
    $('.cluster-list-row[variant-name="'+var_name+'"]').mouseenter();
  }).mouseout(function() {
    $('.cluster-list-row[variant-name="'+var_name+'"]').mouseleave();
  }).click(function() {
    $('.cluster-list-row[variant-name="'+var_name+'"]').click();
  });
}
function addClusterRowHandlers() {
  $('.cluster-list-row').on({
    "click": function() {
      console.log('click', this.getAttribute('variant-name'));
    },
    "mouseenter": function() {
      var var_name = this.getAttribute('variant-name');
      $(this).css('background-color', repvar.opts.colours.cluster_highlight);
      repvar.clusters[var_name].cluster_obj.attr({fill:repvar.opts.colours.cluster_highlight});
      for (var i=0; i<repvar.clusters[var_name].nodes.length; ++i) {
        repvar.nodes[repvar.clusters[var_name].nodes[i]].label_highlight.show();
      }
    },
    "mouseleave": function() {
      var var_name = this.getAttribute('variant-name'),
        orig_colour = repvar.opts.colours[repvar.clusters[var_name].cluster_obj['repvar-colour-key']];
      $(this).css('background-color', '');
      repvar.clusters[var_name].cluster_obj.attr({fill:orig_colour});
      for (var i=0; i<repvar.clusters[var_name].nodes.length; ++i) {
        repvar.nodes[repvar.clusters[var_name].nodes[i]].label_highlight.hide();
      }
    }
  });
}
function addNodeObjHandlers(circle, var_name) {
  circle.mouseover(function() {
    repvar.nodes[var_name].label_highlight.show();
  }).mouseout(function() {
    repvar.nodes[var_name].label_highlight.hide();
  }).click(function() {
    console.log('clicked', var_name);
  });
}

// =====  Graph functions:
function drawDistanceHistogram() {
  var margin = repvar.opts.histo.margin;
  var total_width_str = getComputedStyle(document.getElementById("summaryStatsDiv")).getPropertyValue("width"),
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
      for (var i=0; i<d.names.length; ++i) {
        repvar.nodes[d.names[i]].label_highlight.show();
      }
    })
    .on("mouseout", function(d) {
      for (var i=0; i<d.names.length; ++i) {
        repvar.nodes[d.names[i]].label_highlight.hide();
      }
    })
    .on("click", function(d) {
      console.log('clicked', d.names);
    });
  // Draw the title and axes:
  svg.append("text")
    .attr("class", "histo-title")
    .attr("dy", "0.8em") //.attr("dy", ".35em")
    .attr("x", total_width / 2)
    .attr("text-anchor", "middle")
    .text("Distribution of distances");
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
    repvar.clusters[repvar.variants[i]] = {'score':data.scores[i], 'nodes':data.clusters[i], 'cluster_obj':null};
  }
}
