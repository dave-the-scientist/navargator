// core.js then core_tree_functions.js are loaded before this file.

// TODO:
// - Would be nice to have a graph showing the total score for each number of clusters. Have it show up in the 'Repvar results pages' box, once you cluster 3 or more. Would help select useful number.

// =====  Modified common variables:
repvar.result_links = {};
repvar.opts.sizes.bar_chart_height = 0, repvar.opts.sizes.bar_chart_buffer = 0;

// =====  Page setup:
function setupPage() {
  $(".jq-ui-button").button(); // Converts these html buttons into jQuery-themed buttons. Provides style and features, including .button('disable')
  $("#errorDialog").dialog({modal:true, autoOpen:false,
    buttons:{Ok:function() { $(this).dialog("close"); }}
  });
  page.session_id = location.search.slice(1);
  page.browser_id = generateBrowserId(10);
  var tree_width_str = getComputedStyle(document.getElementById("mainTreeDiv")).getPropertyValue("--tree-width");
  repvar.opts.sizes.tree = parseInt(tree_width_str.slice(0,-2));
  setupTreeElements();
  setupRunOptions();
  setupNodeSelection();
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
  }).spinner('value', 3);
  $("#rangeSpinner").spinner({
    min: 2, max: null,
    numberFormat: 'N0', step: 1,
    disabled: true
  }).spinner('value', 3);
  $("#rangeCheckbox")[0].checked = false;
  $("#chosenButton").button('disable');
  $("#availButton").button('disable');
  $("#ignoreButton").button('disable');
  $("#clustMethodSelect").selectmenu();
  //$("#clustMethodSelect").selectmenu('refresh'); Needed if I dynamically modify the menu.

  // Button callbacks:
  $("#rangeCheckbox").change(function() {
    if ($(this).is(':checked')) {
      $("#rangeSpinner").spinner('enable');
    } else {
      $("#rangeSpinner").spinner('disable');
    }
  });
  $("#chosenButton").click(function() {
    showNodeSelection('chosen', repvar.chosen, repvar.ignored);
  });
  $("#availButton").click(function() {
    showNodeSelection('available', repvar.available, repvar.ignored.concat(repvar.chosen));
  });
  $("#ignoreButton").click(function() {
    showNodeSelection('ignored', repvar.ignored, repvar.chosen);
  });
  $("#findVariantsButton").click(function() {
    if (!( validateSpinner($("#numVarSpinner"), "Variants to find") &&
      validateSpinner($("#rangeSpinner"), "Range of variants") )) {
      return false;
    }
    var num_vars = $("#numVarSpinner").spinner('value'), vars_range = num_vars;
    if ($("#rangeCheckbox").is(':checked')) {
      vars_range = $("#rangeSpinner").spinner('value');
      if (vars_range <= num_vars) {
        showErrorPopup("The 'Range of variants' value must be greater than the 'Variants to find' value.");
        return false;
      }
    }
    var num_vars_int = parseInt(num_vars), vars_range_int = parseInt(vars_range),
      cluster_method = $("#clustMethodSelect").val(), do_find_vars = false, first_result_page = null;
    for (var i=num_vars_int; i<=vars_range_int; ++i) {
      if (!repvar.result_links.hasOwnProperty(i)) {
        do_find_vars = true;
      }
    }
    if (do_find_vars == false) {
      return false;
    }
    var auto_open = ($("#autoOpenCheckbox").is(':checked'));
    if (auto_open == true) {
      // Have to open the page directly from the user's click to avoid popup blockers.
      first_result_page = window.open('', '_blank');
    }
    $.ajax({
      url: daemonURL('/find-variants'),
      type: 'POST',
      data: {'session_id': page.session_id, 'chosen':repvar.chosen, 'available':repvar.available, 'ignored':repvar.ignored, 'cluster_method':cluster_method, 'num_vars':num_vars, 'vars_range':vars_range},
      success: function(data_obj) {
        var data = $.parseJSON(data_obj);
        var new_s_id = data.session_id, runs_began = data.runs_began;
        if (new_s_id != page.session_id) {
          page.session_id = new_s_id;
          clearHideResultsPane();
        }
        if (runs_began.length > 0) {
          updateResultsPane(runs_began);
          if (auto_open == true && first_result_page != null) {
            first_result_page.location.href = repvar.result_links[runs_began[0]];
          }
        }
      },
      error: function(error) { processError(error, "Server error in finding variants"); }
    });

  });
}
function setupNodeSelection() {
  $("#nodeSelectAll").change(function() {
    if ($(this).is(':checked')) {
      $(".node-select-checkbox").filter(':enabled').prop('checked', true);
    } else {
      $(".node-select-checkbox").filter(':enabled').prop('checked', false);
    }
  });
  $("#nodeSelectSaveButton").click(function() {
    var node_list = [];
    $(".node-select-checkbox").filter(':checked').each(function() {
      node_list.push($(this).prop('name'));
    });
    var node_type = $("#nodeSelectSpan").html();
    if (node_type == 'available') {
      if (repvar.available != node_list) {
        clearHideResultsPane();
        repvar.available = node_list;
      }
    } else if (node_type == 'chosen') {
      if (repvar.chosen != node_list) {
        clearHideResultsPane();
        repvar.available = $.grep(repvar.available, function(n, i) {
          return (node_list.indexOf(n) == -1)
        });
        repvar.chosen = node_list;
      }
    } else if (node_type == 'ignored') {
      if (repvar.ignored != node_list) {
        clearHideResultsPane();
        repvar.available = $.grep(repvar.available, function(n, i) {
          return (node_list.indexOf(n) == -1)
        });
        repvar.ignored = node_list;
      }
    } else {
      showErrorPopup("Error updating node selection; node type '"+node_type+"' not recognized.");
    }
    $("#mainNodeSelectDiv").hide();
    updateRunOptions();
  });
  $("#nodeSelectCancelButton").click(function() {
    $("#mainNodeSelectDiv").hide();
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
function newTreeLoaded(data_obj) {
  parseRepvarData(data_obj);
  clearInterval(page.maintain_interval_obj);
  page.maintain_interval_obj = setInterval(maintainServer, page.maintain_interval);
  if (repvar.tree_data) {
    drawTree();
    updateRunOptions();
    updateNodeSelection();
    $("#uploadFileInput").val('');
    $("#saveRepvarButton").button('enable');
    $("#uploadFileButton").button('disable');
    clearHideResultsPane();
  }
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
  $("#chosenButton").button('enable');
  $("#availButton").button('enable');
  $("#ignoreButton").button('enable');
  updateCAIVariantMarkers();
}
function clearHideResultsPane() {
  repvar.result_links = {};
  $("#resultsLinksDiv").hide();
  $(".result-link-li").remove();
}
function updateResultsPane(runs_began) {
  var var_num, results_url, result_description, result_link_obj;
  for (var i=0; i<runs_began.length; ++i) {
    var_num = runs_began[i];
    results_url = page.server_url + '/results?' + page.session_id + '_' + var_num;
    result_description = var_num + ' representative variants';
    result_link_obj = $('<a>', {
      text:result_description, title:result_description, href:results_url, target:'_blank'
    }).wrap('<li class="result-link-li">').parent();
    $("#resultsLinksList").append(result_link_obj);
    repvar.result_links[var_num] = results_url;
  }
  $("#resultsLinksDiv").show();
}
function updateNodeSelection() {
  // Updates the list of variant checkboxes in the node selection pane. Should be called every time the phylogenetic tree is modified.
  $('#nodeSelectCheckboxes > .node-select-checkbox-label').remove();
  for (var i=0; i<repvar.leaves.length; ++i) {
    var checkbox = $('<label class="node-select-checkbox-label"><input type="checkbox" class="node-select-checkbox" />'+repvar.leaves[i]+'</label>');
    checkbox.children().prop('name', repvar.leaves[i]);
    $("#nodeSelectCheckboxes").append(checkbox);
  }
}
function showNodeSelection(selecting_for, checked_if_in, disabled_if_in) {
  $("#nodeSelectSpan").html(selecting_for);
  $("#chosenButton").button('disable');
  $("#availButton").button('disable');
  $("#ignoreButton").button('disable');
  // Prepare the node selection checkboxes:
  if (checked_if_in.length == repvar.leaves.length) {
    $("#nodeSelectAll").prop('checked', true);
  } else {
    $("#nodeSelectAll").prop('checked', false);
  }
  $(".node-select-checkbox").each(function() {
    var checkbox = $(this);
    var name = checkbox.prop('name');
    if (checked_if_in.indexOf(name) != -1) {
      checkbox.prop('checked', true);
    } else {
      checkbox.prop('checked', false);
    }
    if (disabled_if_in.indexOf(name) != -1) {
      checkbox.attr('disabled', true);
    } else {
      checkbox.attr('disabled', false);
    }
  });
  $("#mainNodeSelectDiv").show();
}

// =====  Data parsing:
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
