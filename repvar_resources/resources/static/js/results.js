// core.js then core_tree_functions.js are loaded before this file.

// This page is loaded, then continually checks with the server to see if the results are ready yet. It might be better (probably not) to use a Flask socket, that allows either the server or client to initiate communication. Good explanation here https://www.shanelynn.ie/asynchronous-updates-to-a-webpage-with-flask-and-socket-io/


// =====  Modified common variables:
page.check_results_interval = 1000;
repvar.num_variants = null, repvar.variants = [], repvar.clusters = {}, repvar.variant_distance = {}, repvar.max_variant_distance = 0.0;


//TODO:
// - Draw clusters.
//   - Mouseover on cluster list should highlight the cluster on the tree, as well as highlight the sequences themselves (clusters will often be non-contiguous).
// - Option to normalize bar graph heights against max value in the tree, or against the max value from all repvar runs in the cache
//   - Though this wouldn't update if you ran new ones. It would also require an ajax call on activation (not a problem).

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
        updateClusteredVariantMarkers();
        drawBarGraphs();
        updateSummaryStats();
        drawClusters();
        updateClusterList();
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
function updateClusterList() {
  var max_var_name_length = 15;
  var var_name, short_name, clstr_size, clstr_score, clstr_avg_score, avg_title, name_td, size_td, score_td,
    table_body = $("#clustersListTable > tbody");
  for (var i=0; i<repvar.variants.length; ++i) {
    var_name = repvar.variants[i];
    short_name = var_name.slice(0, max_var_name_length);
    clstr_size = repvar.clusters[repvar.variants[i]].nodes.length;
    clstr_score = repvar.clusters[repvar.variants[i]].score;
    clstr_avg_score = roundFloat(clstr_score/clstr_size, 4);
    clstr_score = roundFloat(clstr_score, 4);
    avg_title = 'Average distance: '+clstr_avg_score;
    name_td = "<td title='"+var_name+"'>"+short_name+"</td>";
    size_td = "<td title='"+avg_title+"'>"+clstr_size+"</td>";
    score_td = "<td title='"+avg_title+"'>"+clstr_score+"</td>";
    table_body.append("<tr>"+name_td+size_td+score_td+"</tr>");
  }
}

// =====  Data parsing:
function parseRepvarData(data_obj) {
  var data = $.parseJSON(data_obj);
  page.session_id = data.session_id;
  repvar.tree_data = data.phyloxml_data;
  repvar.leaves = data.leaves;
  repvar.ignored = data.ignored;
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
    repvar.clusters[repvar.variants[i]] = {'score':data.scores[i], 'nodes':data.clusters[i]};
  }
}
