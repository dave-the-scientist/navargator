// core.js then core_tree_functions.js are loaded before this file.

// TODO:
// - Move the 'g', 'x_fxn', 'y_fxn', 'line_fxn', 'x_axis', 'y_axis' out of repvar.opts and into repvar.graph
// - I really don't like how the control-element buttons look, especially the 'add to selection' from search button, and the controls on the results histogram. Do something with them, even if just making them regular buttons.
// - Do something to the h2 text. Background, "L" underline (like the labels), something like that.
// - I love the simple animations on hover. Would be great if I find a use for them.
//   - From the answer of https://stackoverflow.com/questions/30681684/animated-toggle-button-for-mobile
//   - Maybe just make the X (from assign labels) spin on hover. Or, could replace that with a 'hamburger' button, that morphs into an X and the 'update' button on hover.
// - I'd like to design a better 'Selected variants: X' panel (including select all and clear all buttons).
//   - Another candidate for one of those morphing hamburger buttons.
//   - If I did compact that a little (even if I don't at all), I could move it to the top-left corner of the tree (on both input and results pages).
// - The header could use some design work. Apply some of the gradients/shadowing from https://designmodo.com/3d-css3-button/
// - I quite like how the toggle button came out. Use that to style my buttons instead of relying on jqueryui.
// - The tree on the results page looks more cohesive, because it's incorporating colours from the page. Add them somehow to the input tree (after dealing with the H2; an idea might come from that).


// =====  Modified common variables:
page.check_results_timer = null, page.check_results_interval = 500;
repvar.result_links = {'var_nums':[], 'scores':[]}, repvar.assigned_selected = '';
repvar.opts.sizes.bar_chart_height = 0, repvar.opts.sizes.bar_chart_buffer = 0;
repvar.opts.graph = {
  'width':null, 'height':null, 'margin':{top:7, right:27, bottom:35, left:37},
  'g':null, 'x_fxn':null, 'y_fxn':null, 'line_fxn':null, 'x_axis':null, 'y_axis':null
};
// Also adds repvar.nodes[var_name].variant_select_label

// =====  Page setup:
function setupPage() {
  $(".jq-ui-button").button(); // Converts html buttons into jQuery-themed buttons. Provides style and features, including .button('disable')
  $("#errorDialog").dialog({modal:true, autoOpen:false,
    buttons:{Ok:function() { $(this).dialog("close"); }}
  });
  page.session_id = location.search.slice(1);
  page.browser_id = generateBrowserId(10);
  var tree_width_str = $("#mainTreeDiv").css('width');
  repvar.opts.sizes.tree = parseInt(tree_width_str.slice(0,-2));
  var score_graph_width = $("#scoreGraphSvg").css('width');
  repvar.opts.graph.width = parseInt(score_graph_width.slice(0,-2));
  var score_graph_height = $("#scoreGraphSvg").css('height');
  repvar.opts.graph.height = parseInt(score_graph_height.slice(0,-2));
  setupTreeElements();
  setupRunOptions();
  setupScoresGraph();
  setupVariantSelection();
  setupUploadSaveButtons();

  if (page.session_id != '') {
    // This is only run for the local version.
    $.ajax({
      url: daemonURL('/get-input-data'),
      type: 'POST',
      data: {'session_id': page.session_id},
      success: function(data_obj) {
        newTreeLoaded(data_obj);
      },
      error: function(error) { processError(error, "Error loading input data from the server"); }
    });
  }
}
function setupUploadSaveButtons() {
  $("#uploadFileButton").button('disable');
  $("#saveRepvarButton").button('disable');

  $("#uploadFileInput").change(function() {
    if ($("#uploadFileInput")[0].files[0]) {
      $("#uploadFileButton").button('enable');
    } else {
      $("#uploadFileButton").button('disable');
    }
  });
  $("#uploadFileButton").click(function() {
    var file_obj = $("#uploadFileInput")[0].files[0];
    if (!file_obj) {
      showErrorPopup("No file selected.");
      return false;
    } else if (file_obj.size > page.max_upload_size) {
      showErrorPopup("The selected file exceeds the maximum upload size.");
      return false;
    }
    var form_data = new FormData($('#uploadFilesForm')[0]), upload_url = '';
    form_data.append('session_id', page.session_id);
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
        // Change title of tree pane to filename = $("#uploadFileInput")[0].files[0].name
        newTreeLoaded(data_obj);
      },
      error: function(error) {
        processError(error, "Error uploading files");
      }
    });
  });
  $("#saveRepvarButton").click(function() {
    $.ajax({
      url: daemonURL('/save-repvar-file'),
      type: 'POST',
      data: {'session_id': page.session_id, 'chosen':repvar.chosen, 'available':repvar.available, 'ignored':repvar.ignored},
      success: function(data_obj) {
        var data = $.parseJSON(data_obj);
        page.session_id = data.session_id;
        if (data.saved_locally == true) {
          console.log('file saved locally');
        } else {
          saveDataString(data.repvar_as_string, 'web_tree.repvar', 'text/plain');
        }
      },
      error: function(error) { processError(error, "Error saving repvar file"); }
    });
  });
}
function setupRunOptions() {
  $("#numVarSpinner").spinner({
    min: 2, max: null,
    numberFormat: 'N0', step: 1
  }).spinner('value', 2);
  $("#rangeSpinner").spinner({
    min: 2, max: null,
    numberFormat: 'N0', step: 1
  }).spinner('value', 3);
  $("#numVarSpinner").on('spin', function(event, ui) {
    var cur_val = ui.value,
      range_spin = $("#rangeSpinner"), range_val = range_spin.spinner('value');
    if (cur_val > range_val) {
      range_spin.spinner('value', cur_val);
    }
  });
  $("#rangeSpinner").on('spin', function(event, ui) {
    var cur_val = ui.value,
      single_spin = $("#numVarSpinner"), single_val = single_spin.spinner('value');
    if (cur_val < single_val) {
      single_spin.spinner('value', cur_val);
    }
  });
  $(".multiple-run-only").css('visibility', 'hidden');
  $("#rangeSpinner").parent().css('visibility', 'hidden');
  $("#clustMethodSelect").selectmenu();
  //$("#clustMethodSelect").selectmenu('refresh'); Needed if I dynamically modify the menu.

  // Button callbacks:
  $("#singleRunCheckbox, #multipleRunCheckbox").change(function() {
    if ($("#singleRunCheckbox").is(':checked')) {
      $(".single-run-only").css('visibility', 'visible');
      $(".multiple-run-only").css('visibility', 'hidden');
      $("#rangeSpinner").parent().css('visibility', 'hidden');
    } else {
      $(".single-run-only").css('visibility', 'hidden');
      $(".multiple-run-only").css('visibility', 'visible');
      $("#rangeSpinner").parent().css('visibility', 'visible');
    }
  });

  $("#findVariantsButton").click(function() {
    var ret = validateFindVariantsCall();
    if (ret == false) {
      return false;
    } else {
      var num_vars = ret.num_vars, num_vars_range = ret.num_vars_range,
        cluster_method = $("#clustMethodSelect").val();
    }
    var auto_open = ($("#singleRunCheckbox").is(':checked') && $("#autoOpenCheckbox").is(':checked')),
      auto_result_page = null;
    if (auto_open == true) {
      // Have to open the page directly from the user's click to avoid popup blockers.
      auto_result_page = window.open('', '_blank');
    }
    $.ajax({
      url: daemonURL('/find-variants'),
      type: 'POST',
      data: {'session_id': page.session_id, 'chosen':repvar.chosen, 'available':repvar.available, 'ignored':repvar.ignored, 'cluster_method':cluster_method, 'num_vars':num_vars, 'num_vars_range':num_vars_range},
      success: function(data_obj) {
        var data = $.parseJSON(data_obj);
        var new_s_id = data.session_id;
        if (new_s_id != page.session_id) {
          page.session_id = new_s_id;
          clearHideResultsPane();
        }
        updateResultsPane(num_vars, num_vars_range);
        if (auto_open == true && auto_result_page != null) {
          auto_result_page.location.href = repvar.result_links[num_vars].url;
        }
      },
      error: function(error) { processError(error, "Server error in finding variants"); }
    });
  });
}
function setupScoresGraph() {
  var total_width = repvar.opts.graph.width, total_height = repvar.opts.graph.height, margin = repvar.opts.graph.margin, width = total_width - margin.left - margin.right, height = total_height - margin.top - margin.bottom;
  // Set up svg and g objects:
  var svg = d3.select("#scoreGraphSvg")
    .attr("width", total_width)
    .attr("height", total_height);
  repvar.opts.graph.g = svg.append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
  // Set up graphing functions:
  repvar.opts.graph.x_fxn = d3.scaleLinear()
    .range([0, width]);
  repvar.opts.graph.y_fxn = d3.scaleLinear()
    .range([height, 0]);
  repvar.opts.graph.line_fxn = d3.line()
    .x(function(d,i) { return repvar.opts.graph.x_fxn(repvar.result_links.var_nums[i]); })
    .y(function(d,i) { return repvar.opts.graph.y_fxn(d); });
  // Set up graph axes:
  repvar.opts.graph.x_axis = d3.axisBottom(repvar.opts.graph.x_fxn)
    .tickFormat(d3.format("d"));
  repvar.opts.graph.g.append("g")
    .attr("class", "x-axis")
    .attr("transform", "translate(0," + height + ")")
    .call(repvar.opts.graph.x_axis);
  repvar.opts.graph.y_axis = d3.axisLeft(repvar.opts.graph.y_fxn)
    .tickFormat(d3.format("d"));
  repvar.opts.graph.g.append("g")
    .attr("class", "y-axis")
    .call(repvar.opts.graph.y_axis);
  // Set up axis labels:
  repvar.opts.graph.g.append("text") // x axis
    .attr("class", "score-axis-label")
    .attr("text-anchor", "middle")
    .attr("x", width / 2)
    .attr("y", height + 30)
    .text("Number of variants");
  repvar.opts.graph.g.append("text") // y axis
    .attr("class", "score-axis-label")
    .attr("text-anchor", "middle")
    .attr("x", 0 - height/2)
    .attr("y", 0 - 23)
    .attr("transform", "rotate(-90)")
    .text("Tree score");
  // Set up the graph line:
  repvar.opts.graph.g.append("path")
    .attr("class", "score-line");
}
function setupVariantSelection() {
  $("#selectAllButton").click(function() {
    var var_name;
    for (var i=0; i<repvar.leaves.length; ++i) {
      var_name = repvar.leaves[i];
      nodeLabelMouseclickHandler(var_name, false, true);
    }
    numSelectedCallback();
  });
  $("#clearSelectionButton").click(function() {
    var var_name;
    for (var i=0; i<repvar.leaves.length; ++i) {
      var_name = repvar.leaves[i];
      nodeLabelMouseclickHandler(var_name, false, false);
    }
    numSelectedCallback();
  });
  addAssignedLabelHandlers($("#chosenAssignedDiv"), 'chosen');
  addAssignedLabelHandlers($("#availAssignedDiv"), 'available');
  addAssignedLabelHandlers($("#ignoredAssignedDiv"), 'ignored');
  $("#clearChosenButton").click(function(event) {
    addClearAssignedButtonHandler(event, 'chosen');
  });
  $("#clearAvailButton").click(function() {
    addClearAssignedButtonHandler(event, 'available');
  });
  $("#clearIgnoredButton").click(function() {
    addClearAssignedButtonHandler(event, 'ignored');
  });
  $("#chosenUpdateButton").click(function() {
    repvar.chosen = Object.keys(repvar.selected);
    repvar.available = $.grep(repvar.available, function(n, i) { return !(n in repvar.selected) });
    repvar.ignored = $.grep(repvar.ignored, function(n, i) { return !(n in repvar.selected) });
    $("#clearSelectionButton").click();
    updateRunOptions();
  });
  $("#availUpdateButton").click(function() {
    repvar.chosen = $.grep(repvar.chosen, function(n, i) { return !(n in repvar.selected) });
    repvar.available = Object.keys(repvar.selected);
    repvar.ignored = $.grep(repvar.ignored, function(n, i) { return !(n in repvar.selected) });
    $("#clearSelectionButton").click();
    updateRunOptions();
  });
  $("#ignoreUpdateButton").click(function() {
    repvar.chosen = $.grep(repvar.chosen, function(n, i) { return !(n in repvar.selected) });
    repvar.available = $.grep(repvar.available, function(n, i) { return !(n in repvar.selected) });
    repvar.ignored = Object.keys(repvar.selected);
    $("#clearSelectionButton").click();
    updateRunOptions();
  });
  $("#chosenUpdateButton").button('disable');
  $("#availUpdateButton").button('disable');
  $("#ignoreUpdateButton").button('disable');
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
function newTreeLoaded(data_obj) {
  parseRepvarData(data_obj);
  clearInterval(page.maintain_interval_obj);
  page.maintain_interval_obj = setInterval(maintainServer, page.maintain_interval);
  if (repvar.tree_data) {
    $("#introMessageGroup").remove();
    drawTree();
    updateVarSelectList();
    updateRunOptions();
    $("#uploadFileInput").val('');
    $("#saveRepvarButton").button('enable');
    $("#uploadFileButton").button('disable');
    clearHideResultsPane();
  }
}
function updateVarSelectList() {
  // Updates the list of variants in the selection pane. Should be called every time the phylogenetic tree is modified.
  $('#varSelectDiv > .var-select-label').remove();
  var var_name, short_name, label;
  for (var i=0; i<repvar.leaves.length; ++i) {
    var_name = repvar.leaves[i];
    if (var_name.length > repvar.opts.sizes.max_variant_name_length) {
      short_name = var_name.slice(0, repvar.opts.sizes.max_variant_name_length);
      label = $('<label name="'+var_name+'" class="var-select-label prevent-text-selection" title="'+var_name+'">'+short_name+'</label>');
    } else {
      label = $('<label name="'+var_name+'" class="var-select-label prevent-text-selection">'+var_name+'</label>');
    }
    $("#varSelectDiv").append(label);
    repvar.nodes[var_name].variant_select_label = label;
    addVariantLabelCallbacks(label, var_name);
  }
  $("#chosenAssignedDiv").css('border-color', repvar.opts.colours['chosen']);
  $("#availAssignedDiv").css('border-color', repvar.opts.colours['available']);
  $("#ignoredAssignedDiv").css('border-color', repvar.opts.colours['ignored']);
  $("#numVariantsSpan").html(repvar.leaves.length);
  $("#mainVariantSelectDiv").show();
}
function updateRunOptions() {
  // Updates the max on the number of variants spinner, and the labels of the choose available and ignored variant buttons. Should be called every time the available or ignored variants are modified.
  var maxVars = repvar.chosen.length + repvar.available.length;
  if (maxVars == 0) {
    maxVars = null;
  }
  $("#numVarSpinner").spinner('option', 'max', maxVars);
  $("#rangeSpinner").spinner('option', 'max', maxVars);
  $("#numChosenSpan").html(repvar.chosen.length);
  $("#numAvailSpan").html(repvar.available.length);
  $("#numIgnoredSpan").html(repvar.ignored.length);
  updateCAIVariantMarkers();
  clearHideResultsPane();
}
function updateCAIVariantMarkers() {
  // CAI stands for chosen, available, ignored.
  var var_name, circle, circle_radius, colour_key;
  for (var i=0; i<repvar.leaves.length; ++i) {
    var_name = repvar.leaves[i];
    circle = repvar.nodes[var_name].circle;
    circle_radius = repvar.opts.sizes.big_marker_radius;
    if (repvar.chosen.indexOf(var_name) != -1) {
      colour_key = 'chosen';
    } else if (repvar.available.indexOf(var_name) != -1) {
      colour_key = 'available';
    } else if (repvar.ignored.indexOf(var_name) != -1) {
      colour_key = 'ignored';
    } else {
      colour_key = 'node';
      circle_radius = repvar.opts.sizes.small_marker_radius;
    }
    changeNodeStateColour(var_name, circle, 'node_rest', colour_key);
    circle.attr({'r':circle_radius});
    $(".var-select-label[name='"+var_name+"'").css('border-color', repvar.opts.colours[colour_key]);
  }
}
function clearHideResultsPane() {
  repvar.result_links = {'var_nums':[], 'scores':[]};
  $("#resultsLinksDiv").hide();
  $("#scoreGraphSvg").hide();
  $(".result-link-li").remove();
}
function updateResultsPane(num_vars, num_vars_range) {
  var results_url, result_description, result_link_obj, result_list_obj,
    links_list = $("#resultsLinksList");
  // Add links for the new runs into the results pane:
  for (var var_num=num_vars; var_num<=num_vars_range; ++var_num) {
    if (repvar.result_links.hasOwnProperty(var_num)) { continue; }
    results_url = page.server_url + '/results?' + page.session_id + '_' + var_num;
    result_description = var_num + ' variants';
    result_link_obj = $('<a href="'+results_url+'" title="'+result_description+'" target="_blank">'+result_description+' [processing...]</a>');
    result_list_obj = result_link_obj.wrap('<li class="result-link-li">').parent();
    result_list_obj.attr("variantNumber", var_num);
    links_list.append(result_list_obj);
    repvar.result_links[var_num] = {'url':results_url, 'link':result_link_obj, 'score':null};
    repvar.result_links.var_nums.push(var_num);
  }
  // Sort the internal representation of the results:
  repvar.result_links.var_nums.sort(function(a,b) { return a-b; });
  // Sort all of the links in the results pane:
  var sorted_links = $(".result-link-li").get();
  sorted_links.sort(function(a,b) {
    return $(a).attr("variantNumber") - $(b).attr("variantNumber");
  });
  $.each(sorted_links, function(i, li) {
    links_list.append(li); // Removes li from it's current position in links_list, adds it to the end.
  });
  // Act on the new results list:
  $("#resultsLinksDiv").show();
  clearTimeout(page.check_results_timer); // In case it's still checking for a previous run.
  checkIfProcessingDone();
}
function checkIfProcessingDone() {
  $.ajax({
    url: daemonURL('/check-results-done'),
    type: 'POST',
    data: {'session_id': page.session_id, 'var_nums': repvar.result_links.var_nums},
    success: function(data_obj) {
      var data = $.parseJSON(data_obj);
      var ret_var_nums = data.var_nums.map(function(n) { return parseInt(n,10); });
      if (JSON.stringify(ret_var_nums) != JSON.stringify(repvar.result_links.var_nums)) {
        console.log('Aborting checkIfProcessingDone(), as the returned list does not match');
        return false; // RACE CONDITION: Don't update anything, because the user has already re-run the analysis.
      }
      var draw_graph = true, score, var_num;
      for (var i=0; i<data.var_scores.length; ++i) {
        score = data.var_scores[i];
        var_num = ret_var_nums[i];
        if (score == false) {
          draw_graph = false;
        } else if (repvar.result_links[var_num].score == null) {
          repvar.result_links[var_num].score = score;
          repvar.result_links[var_num].link.html(var_num+' variants ['+roundFloat(score, 4)+']');
        } else if (repvar.result_links[var_num].score != score) {
          showErrorPopup("Error: scores from the server don't match existing scores.");
        }
      }
      if (draw_graph == false) {
        page.check_results_timer = setTimeout(checkIfProcessingDone, page.check_results_interval);
      } else {
        repvar.result_links.scores = data.var_scores;
        updateScoreGraph();
      }
    },
    error: function(error) { processError(error, "Error checking if the results have finished"); }
  });
}
function updateScoreGraph() {
  if (repvar.result_links.var_nums.length == 1) {
    // No action currently taken.
  } else {
    // Update x and y domains:
    var min_var = repvar.result_links.var_nums[0],
      max_var = repvar.result_links.var_nums[repvar.result_links.var_nums.length-1];
    repvar.opts.graph.x_fxn.domain(
      [min_var, max_var]
    );
    repvar.opts.graph.y_fxn.domain(
      [ Math.floor(d3.min(repvar.result_links.scores)),
        Math.ceil(d3.max(repvar.result_links.scores)) ]
    );
    // Update x and y axes with the new domains:
    repvar.opts.graph.x_axis.tickValues(repvar.result_links.var_nums);
    repvar.opts.graph.y_axis.tickValues(repvar.opts.graph.y_fxn.ticks(3));
    repvar.opts.graph.g.select(".x-axis")
      .transition()
      .call(repvar.opts.graph.x_axis);
    repvar.opts.graph.g.select(".y-axis")
      .transition()
      .call(repvar.opts.graph.y_axis);
    // Update the graph line:
    repvar.opts.graph.g.select(".score-line")
      .transition()
      .attr("d", function() { return repvar.opts.graph.line_fxn(repvar.result_links.scores); });
    $("#scoreGraphSvg").show();
  }
}

// =====  Callback and event handlers:
function addAssignedLabelHandlers(label_ele, assigned_key) {
  label_ele.mouseenter(function() {
    var assigned_len = repvar[assigned_key].length;
    if (assigned_len == 0) { return false; }
    label_ele.css('background', repvar.opts.colours.cluster_highlight);
    for (var i=0; i<assigned_len; ++i) {
      nodeLabelMouseoverHandler(repvar[assigned_key][i]);
    }
  }).mouseleave(function() {
    var assigned_len = repvar[assigned_key].length;
    if (repvar.assigned_selected == assigned_key) {
      label_ele.css('background', repvar.opts.colours.selection);
    } else {
      label_ele.css('background', '');
    }
    for (var i=0; i<assigned_len; ++i) {
      nodeLabelMouseoutHandler(repvar[assigned_key][i]);
    }
  }).click(function() {
    var assigned_len = repvar[assigned_key].length;
    if (assigned_len == 0) { return false; }
    var full_select = (repvar.assigned_selected != assigned_key);
    if (full_select) {
      label_ele.css('background', repvar.opts.colours.selection);
    } else {
      label_ele.css('background', repvar.opts.colours.cluster_highlight);
    }
    for (var i=0; i<assigned_len; ++i) {
      nodeLabelMouseclickHandler(repvar[assigned_key][i], false, full_select);
    }
    numSelectedCallback();
    if (full_select) {
      repvar.assigned_selected = assigned_key;
    }
  });
}
function addClearAssignedButtonHandler(event, assigned_key) {
  event.stopPropagation();
  var assigned_len = repvar[assigned_key].length;
  if (assigned_len == 0) { return false; }
  for (var i=0; i<assigned_len; ++i) {
    nodeLabelMouseoutHandler(repvar[assigned_key][i]);
  }
  repvar[assigned_key] = [];
  if (repvar.assigned_selected == assigned_key) { repvar.assigned_selected = ''; }
  updateRunOptions();
}
function nodeLabelMouseoverHandlerCallback(var_name, label_colour) {
  repvar.nodes[var_name].variant_select_label.css('background', label_colour);
}
function nodeLabelMouseoutHandlerCallback(var_name, label_colour) {
  repvar.nodes[var_name].variant_select_label.css('background', label_colour);
}
function nodeLabelMouseclickHandlerCallback(var_name, label_colour) {
  repvar.nodes[var_name].variant_select_label.css('background', label_colour);
}
function numSelectedCallback() {
  // Update span indicating number of selected variants:
  $("#currentSelectionNum").html(repvar.num_selected);
  // Update assigned labels and controlling variable:
  if (repvar.assigned_selected == 'chosen') {
    $("#chosenAssignedDiv").css('background', '');
  } else if (repvar.assigned_selected == 'available') {
    $("#availAssignedDiv").css('background', '');
  } else if (repvar.assigned_selected == 'ignored') {
    $("#ignoredAssignedDiv").css('background', '');
  }
  repvar.assigned_selected = '';
  // Update assigned 'Update' buttons:
  if (repvar.num_selected == 0) {
    $("#chosenUpdateButton").button('disable');
    $("#availUpdateButton").button('disable');
    $("#ignoreUpdateButton").button('disable');
  } else {
    $("#chosenUpdateButton").button('enable');
    $("#availUpdateButton").button('enable');
    $("#ignoreUpdateButton").button('enable');
  }
}
function addVariantLabelCallbacks(jq_ele, var_name) {
  jq_ele.mouseenter(function() {
    nodeLabelMouseoverHandler(var_name);
  }).mouseleave(function() {
    nodeLabelMouseoutHandler(var_name);
  }).click(function() {
    nodeLabelMouseclickHandler(var_name);
  });
}

// =====  Data parsing / validation:
function parseRepvarData(data_obj) {
  var data = $.parseJSON(data_obj);
  page.session_id = data.session_id;
  repvar.tree_data = data.phyloxml_data;
  repvar.leaves = data.leaves;
  repvar.chosen = data.chosen;
  repvar.available = data.available;
  repvar.ignored = data.ignored;
  if (data.hasOwnProperty('maintain_interval') && data.maintain_interval != page.maintain_interval*1000) {
    maintainServer();
    page.maintain_interval = data.maintain_interval * 1000;
    clearInterval(page.maintain_interval_obj);
    page.maintain_interval_obj = setInterval(maintainServer, page.maintain_interval);
  }
}
function validateFindVariantsCall() {
  if (!( validateSpinner($("#numVarSpinner"), "Variants to find") &&
    validateSpinner($("#rangeSpinner"), "Range of variants") )) {
    return false;
  }
  var num_vars = parseInt($("#numVarSpinner").spinner('value')), num_vars_range = num_vars;
  if ($("#multipleRunCheckbox").is(':checked')) {
    num_vars_range = parseInt($("#rangeSpinner").spinner('value'));
    if (num_vars_range < num_vars) {
      showErrorPopup("The 'Variants to find' values be entered from low to high.");
      return false;
    }
  }
  var num_vars_int = parseInt(num_vars), num_vars_range_int = parseInt(num_vars_range),
    do_find_vars = false;
  for (var i=num_vars_int; i<=num_vars_range_int; ++i) {
    if (!repvar.result_links.hasOwnProperty(i)) {
      do_find_vars = true;
    }
  }
  if (do_find_vars == false) {
    return false;
  }

  return {'num_vars':num_vars, 'num_vars_range':num_vars_range};
}
