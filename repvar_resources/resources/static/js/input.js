// core.js then core_tree_functions.js are loaded before this file.

// TODO:
// - Need a button to select by names. Allow users to paste in sequence names, and assign that list.
//   - Should be located by the Select all / Clear buttons. On click, a large panel slides open (obscuring the tree).
//   - Panel holds an input field to paste into. Buttons on bottom for "add to selection" and "cut from selection". Buttons on side for "validate list" (which bolds or highlights the names that don't match the tree; also performed if user presses enter, as well as on "add" or "cut" operations) and "clear list". Original button should morph to "hide pane". Or perhaps "hide pane" is another button along the side.
// - Should be a button to clear the results pane. Should also clear vf.normalize, but not wipe the cache. This will allow the user to specify what graph is shown and the global normalization, without requiring the clustering to be re-done. Especially important once repvar files actually save clustering results too.
// - The header needs some finishing design work. I'd like to incorporate more green, but should wait for the icon to be finished first.
// - I quite like how the toggle button came out. Use that to style my buttons instead of relying on jqueryui.
// - The tree on the results page looks more cohesive, because it's incorporating colours from the page. Add them somehow to the input tree. Maybe make a circular gradient from the middle of the input tree, in the cluster colour.
// - When the user selects a file to upload, the page should pick a file type based on the file extension, and update the select on the page.
// - For magnifying glass icon on 'search variants' field, I could make it morph into an X on submit. Would want to move it to the right side of the field.
//   - Kinda like from http://www.transformicons.com/; basically have 1 line and 1 circle. For X, circle height becomes 0, for magnifying glass, set equal to width and rotate/move.
//   - Upon submission (clicking magnifying or pressing enter) jquery adds a class, and removes it when the user types any button. Means there's no button to press to clear the field prior to submission, but that's probably fine.
// - Id like to redesign the assigned labels 'update' button. Perhaps it should appear in the same way as the label colour (wipe from left) upon hover of label.
//   - But then would it be intuitive for a user about how to add variants? Maybe best if I made a button group "+ | X", and the + could expand into the word "update" or something.
// - I could re-design the select all / clear button group. Maybe button starts as "[All | X]"; on mouseover of left, the dividing border could move to the right, making "X" smaller and changing text to "Select all"; likewise on mouseover of right side, it expands and the left button shrinks.
//   - Could be 'none' instead of 'clear'.
// - I love the simple animations on hover. Would be great if I find a use for them (from the answer of https://stackoverflow.com/questions/30681684/animated-toggle-button-for-mobile)

//NOTE:
// - If the underlying vf is replaced, have to call setNormalizationMethod() to inform the new vf of the user's choice.
//   - This info is not retained when the new vf is created. I believe the only current points are on loading a new file (either from the button or the automatic load at the start), and when finding variants if any of the assigned variants have changed. Those are all currently covered.

// =====  Modified common variables:
$.extend(page, {
  'check_results_timer':null, 'check_results_interval':500
});
$.extend(repvar, {
  'result_links':{'var_nums':[], 'scores':[]}, 'assigned_selected':'',
  'graph':{'g':null, 'x_fxn':null, 'y_fxn':null, 'line_fxn':null, 'x_axis':null, 'y_axis':null}
});
$.extend(repvar.opts.sizes, {
  'bar_chart_height':0, 'bar_chart_buffer':0
});
$.extend(repvar.opts.graph, {
  'margin':{top:7, right:27, bottom:35, left:37}
});
// Also adds repvar.nodes[var_name].variant_select_label

// =====  Page setup:
function setupPage() {
  initializeButtons();
  $("#errorDialog").dialog({modal:true, autoOpen:false,
    buttons:{Ok:function() { $(this).dialog("close"); }}
  });
  initializeCollapsibleElements();
  page.session_id = location.search.slice(1);
  page.browser_id = generateBrowserId(10);
  console.log('sessionID:'+page.session_id+', browserID:'+page.browser_id);
  var tree_width_str = $("#mainTreeDiv").css('width');
  repvar.opts.sizes.tree = parseInt(tree_width_str.slice(0,-2));
  var score_graph_width_str = $("#scoreGraphSvg").css('width');
  repvar.opts.graph.total_width = parseInt(score_graph_width_str.slice(0,-2));
  var score_graph_height_str = $("#scoreGraphSvg").css('height');
  repvar.opts.graph.total_height = parseInt(score_graph_height_str.slice(0,-2));
  setupTreeElements();
  setupDisplayOptionsPane();
  setupNormalizationPane();
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
        if (!newTreeLoaded(data_obj)) {  // If no session file loaded:
          $("#loadInputHeader").click(); //   open collapsible pane.
        }
      },
      error: function(error) { processError(error, "Error loading input data from the server"); }
    });
  } else {
    $("#loadInputHeader").click(); // Opens collapsible pane
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
function setupDisplayOptionsPane() {

}
function setupNormalizationPane() {
  var go_button_shown = false;
  var self_radio = $("#normSelfRadio"), global_radio = $("#normGlobalRadio"), custom_radio = $("#normValRadio");
  var custom_input = $("#normValInput"), custom_go_button = $("#normValGoButton");
  custom_input.data('prev_val', '');
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
    setNormalizationMethod();
  });
  global_radio.on("change", function(event) {
    hideGoButton();
    setNormalizationMethod();
  });
  custom_radio.click(function(event) {
    var val = custom_input.val();
    if (val == '') {
      custom_input.focus();
      return false; // Prevents the button from being actually selected.
    }
  }).on("change", function(event) {
    custom_go_button.click();
  });
  custom_input.on("keydown", function(event) {
    if (event.which == 13) { // 'Enter' key
      custom_input.blur();
      custom_go_button.click();
      return false;
    }
    showGoButton();
  }).blur(function(event) {
    var val = parseFloat(custom_input.val());
    if (isNaN(val)) {
      val = '';
    }
    if (val == custom_input.data('prev_val')) {
      hideGoButton();
    }
    custom_input.val(val);
  });
  custom_go_button.click(function(event) {
    hideGoButton();
    var val = custom_input.val();
    if (val != '' && val <= 0) {
      showErrorPopup("Error: the 'normalize to' value must be a positive number.");
      val = '';
      custom_input.val('');
    }
    custom_input.data('prev_val', val);
    if (val == '') {
      if (custom_radio.is(':checked')) {
        self_radio.prop('checked', true).change();
      }
      return false;
    }
    custom_radio.prop('checked', true);
    setNormalizationMethod();
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
    }
    var num_vars = ret.num_vars, num_vars_range = ret.num_vars_range,
      cluster_method = $("#clustMethodSelect").val();
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
          setNormalizationMethod();
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
  var total_width = repvar.opts.graph.total_width, total_height = repvar.opts.graph.total_height, margin = repvar.opts.graph.margin, width = total_width - margin.left - margin.right, height = total_height - margin.top - margin.bottom;
  // Set up svg and g objects:
  var svg = d3.select("#scoreGraphSvg")
    .attr("width", total_width)
    .attr("height", total_height);
  repvar.graph.g = svg.append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
  // Set up graphing functions:
  repvar.graph.x_fxn = d3.scaleLinear()
    .range([0, width]);
  repvar.graph.y_fxn = d3.scaleLinear()
    .range([height, 0]);
  repvar.graph.line_fxn = d3.line()
    .x(function(d,i) { return repvar.graph.x_fxn(repvar.result_links.var_nums[i]); })
    .y(function(d,i) { return repvar.graph.y_fxn(d); });
  // Set up graph axes:
  repvar.graph.x_axis = d3.axisBottom(repvar.graph.x_fxn)
    .tickFormat(d3.format("d"));
  repvar.graph.g.append("g")
    .attr("class", "x-axis")
    .attr("transform", "translate(0," + height + ")")
    .call(repvar.graph.x_axis);
  repvar.graph.y_axis = d3.axisLeft(repvar.graph.y_fxn)
    .tickFormat(d3.format("d"));
  repvar.graph.g.append("g")
    .attr("class", "y-axis")
    .call(repvar.graph.y_axis);
  // Set up axis labels:
  repvar.graph.g.append("text") // x axis
    .attr("class", "score-axis-label")
    .attr("text-anchor", "middle")
    .attr("x", width / 2)
    .attr("y", height + 30)
    .text("Number of variants");
  repvar.graph.g.append("text") // y axis
    .attr("class", "score-axis-label")
    .attr("text-anchor", "middle")
    .attr("x", 0 - height/2)
    .attr("y", 0 - 23)
    .attr("transform", "rotate(-90)")
    .text("Tree score");
  // Set up the graph line:
  repvar.graph.g.append("path")
    .attr("class", "score-line");
}
function setupVariantSelection() {
  addAssignedLabelHandlers($("#chosenAssignedDiv"), 'chosen');
  addAssignedLabelHandlers($("#availAssignedDiv"), 'available');
  addAssignedLabelHandlers($("#ignoredAssignedDiv"), 'ignored');
  $("#clearChosenButton").click(function(event) {
    addClearAssignedButtonHandler(event, 'chosen');
  });
  $("#clearAvailButton").click(function(event) {
    addClearAssignedButtonHandler(event, 'available');
  });
  $("#clearIgnoredButton").click(function(event) {
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
  setTimeout(setupPage, 10); // setTimeout is used because otherwise the setInterval call sometimes hangs. I think it's due to the page not being ready when the call happens. I no longer believe that, and I think those issues were caused by the html document loading the js files asynch. Should be fixed.
});
$(window).bind('beforeunload', function() {
  // Lets the background server know this instance has been closed.
  closeInstance();
});

// =====  Page udating:
function newTreeLoaded(data_obj) {
  // Returns true if a tree was loaded, false otherwise.
  parseRepvarData(data_obj);
  clearInterval(page.maintain_interval_obj);
  page.maintain_interval_obj = setInterval(maintainServer, page.maintain_interval);
  if (repvar.tree_data) {
    setNormalizationMethod();
    $("#introMessageGroup").remove();
    $("#treeSelectionDiv").show();
    $("#treeControlsDiv").show();
    drawTree();
    updateVarSelectList();
    updateRunOptions();
    $("#uploadFileInput").val('');
    $("#saveRepvarButton").button('enable');
    $("#uploadFileButton").button('disable');
    clearHideResultsPane();
    return true;
  } else {
    return false;
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
  if (maxVars < 2) {
    maxVars = repvar.leaves.length - repvar.ignored.length;
  }
  if ($("#numVarSpinner").spinner('value') > maxVars) {
    $("#numVarSpinner").spinner('value', maxVars);
  }
  if ($("#rangeSpinner").spinner('value') > maxVars) {
    $("#rangeSpinner").spinner('value', maxVars);
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
        console.log('Aborting checkIfProcessingDone(), as the returned list does not match.');
        return false; // RACE CONDITION: Don't update anything, because the user has already re-run the analysis.
      }
      var draw_graph = true, max_var_dist = 0, score, var_num, max_dist;
      for (var i=0; i<data.var_scores.length; ++i) {
        score = data.var_scores[i];
        var_num = ret_var_nums[i];
        if (score == false) {
          draw_graph = false;
        } else if (repvar.result_links[var_num].score == null) {
          repvar.result_links[var_num].score = score;
          repvar.result_links[var_num].link.html(var_num+' variants ['+roundFloat(score, 4)+']');
          max_dist = parseFloat(data.max_var_dists[i]);
          if (max_dist > max_var_dist) { max_var_dist = max_dist; }
        } else if (repvar.result_links[var_num].score != score) {
          showErrorPopup("Error: scores from the server don't match existing scores.");
        }
      }
      if (max_var_dist > 0) {
        calculateGlobalNormalization(max_var_dist); // So results are processed every 0.5 sec.
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
    repvar.graph.x_fxn.domain(
      [min_var, max_var]
    );
    repvar.graph.y_fxn.domain(
      [ Math.floor(d3.min(repvar.result_links.scores)),
        Math.ceil(d3.max(repvar.result_links.scores)) ]
    );
    // Update x and y axes with the new domains:
    repvar.graph.x_axis.tickValues(repvar.result_links.var_nums);
    repvar.graph.y_axis.tickValues(repvar.graph.y_fxn.ticks(3));
    repvar.graph.g.select(".x-axis")
      .transition()
      .call(repvar.graph.x_axis);
    repvar.graph.g.select(".y-axis")
      .transition()
      .call(repvar.graph.y_axis);
    // Update the graph line:
    repvar.graph.g.select(".score-line")
      .transition()
      .attr("d", function() { return repvar.graph.line_fxn(repvar.result_links.scores); });
    $("#scoreGraphSvg").show();
  }
}

// =====  Callback and event handlers:
function addAssignedLabelHandlers(label_ele, assigned_key) {
  label_ele.mouseenter(function() {
    var assigned_len = repvar[assigned_key].length;
    if (assigned_len == 0) { return false; }
    //label_ele.css('background', repvar.opts.colours.cluster_highlight);
    for (var i=0; i<assigned_len; ++i) {
      nodeLabelMouseoverHandler(repvar[assigned_key][i]);
    }
  }).mouseleave(function() {
    var assigned_len = repvar[assigned_key].length;
    if (repvar.assigned_selected == assigned_key) {
      //label_ele.css('background', repvar.opts.colours.selection);
    } else {
      //label_ele.css('background', '');
    }
    for (var i=0; i<assigned_len; ++i) {
      nodeLabelMouseoutHandler(repvar[assigned_key][i]);
    }
  }).click(function() {
    var assigned_len = repvar[assigned_key].length;
    if (assigned_len == 0) { return false; }
    var full_select = (repvar.assigned_selected != assigned_key);
    if (full_select) {
      //label_ele.css('background', repvar.opts.colours.selection);
      label_ele.addClass('var-assigned-selected');
    } else {
      //label_ele.css('background', repvar.opts.colours.cluster_highlight);
      label_ele.removeClass('var-assigned-selected');
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
    $("#chosenAssignedDiv").removeClass('var-assigned-selected');
  } else if (repvar.assigned_selected == 'available') {
    $("#availAssignedDiv").removeClass('var-assigned-selected');
  } else if (repvar.assigned_selected == 'ignored') {
    $("#ignoredAssignedDiv").removeClass('var-assigned-selected');
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
function setNormalizationMethod() {
  var norm = getNormalizationSettings();
  $.ajax({
    url: daemonURL('/set-normalization-method'),
    type: 'POST',
    data: {'session_id': page.session_id, 'normalization':norm},
    error: function(error) { processError(error, "Error setting the normalization method"); }
  });
}
function calculateGlobalNormalization(max_var_dist) {
  // This should be called for every run, no matter if the user has selected global norm or not.
  var bins = calculateHistoBins(max_var_dist);
  $.ajax({
    url: daemonURL('/calculate-global-normalization'),
    type: 'POST',
    data: {'session_id': page.session_id, 'var_nums':repvar.result_links.var_nums, 'max_var_dist':max_var_dist, 'global_bins':bins, 'cur_var':null},
    success: function(data_obj) {
      //var data = $.parseJSON(data_obj);
    },
    error: function(error) { processError(error, "Error calculating global normalization values"); }
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
  if (!repvar.tree_data) {
    return false;
  }
  if (repvar.available.length + repvar.chosen.length < 2) {
    showErrorPopup("You must select 2 or more variants from your tree and assign them as 'available' or 'chosen' before NaVARgator can perform clustering.");
    return false;
  }
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
function getNormalizationSettings() {
  var ret = {'method':null, 'value':null};
  if ($("#normSelfRadio").is(':checked')) {
    ret.method = 'self';
  } else if ($("#normGlobalRadio").is(':checked')) {
    ret.method = 'global';
  } else if ($("#normValRadio").is(':checked')) {
    ret.method = 'custom';
    ret.value = parseFloat($("#normValInput").val());
  } else {
    showErrorPopup("Error: could not retrieve normalization settings from the page.");
  }
  return ret;
}

// =====  Misc functions:
function calculateHistoBins(max_var_dist) {
  // The upper bound of each bin is not inclusive.
  var x_fxn = d3.scaleLinear().domain([0, max_var_dist]);
  var x_ticks = x_fxn.ticks(repvar.opts.graph.histo_bins);
  if (max_var_dist >= x_ticks[x_ticks.length-1]) {
    x_ticks.push(x_ticks[x_ticks.length-1] + x_ticks[1]);
  }
  return x_ticks;
}
