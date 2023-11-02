// exploration (multi-armed bandit) task modified based on Cockburn et al. (2022)
// 5 stimuli in each block, 3 familiar + 2 novel
// 20 trials in each block * 20 blocks
// present 2 stimuli randomly at each trial
// Initial set: 2 familiar + 1 novel
// Holdout set: 1 familiar + 1 novel
// Holdout stimuli will be introduced randomly after 8 trials
// familiar stimulus is defined as the stimulus presented more than 4 times


const jsPsych = initJsPsych({
    //on_finish: function()
    //{
        //jsPsych.data.displayData("csv")

        // output data in the form of csv
        //jsPsych.data.get().localSave("csv", "data.csv")
    //}
});

let start_FS = {// fullscreen
    type: jsPsychFullscreen,
    message: '<p>ウィンドウサイズを最大化します。下のボタンを押してください。</p>',
    button_label: 'ここをクリックしてください',
    fullscreen_mode: true 
};

// ----------- prepare necessary functions -----------
// function to generate random numbers from gaussian distribution (using randn func of jStat library)
let rnorm = function (m, sd, o) {
    a = jStat.randn(1);
    b = a*sd + m;
    if (o == 1) { // avoid negative outcome
        if (b < 0) {
            b = 0;
        }
    };
    return b;
};

// function to generate random numbers from uniform distribution
let runif = function(min, max) {
    let a = Math.random();
    b = a * (max-min) + min;
    return b;
};

// function to slice arrays into subsets
function slice_array(array, length) {
    let sliced = [];
    let n_subset = array.length/length;
    //console.log(n_subset);
    for (let k=1; k<(n_subset+1); k++) {
        let tmp_list = array.splice(0, length);
        //console.log(tmp_list);
        sliced[k-1] = tmp_list;
    };
    return sliced;
};

// function to replace multiple elements of the array to a certain value at once
function replace_once(array, indices, v) {
    for (let k=0; k<indices.length; k++) {
        array[indices[k]] = v;
    };
    return array;
};

// function to calculate numerical difference of each component of the two arrays
function array_subtract(array1, array2) {
    let a = array1.length;
    if (a !== array2.length) {
        return "Length does not match!";
    };

    let tmp_res = Array(a).fill(0);
    for (let k=0; k<a; k++) {
        tmp_res[k] = array1[k] - array2[k];
    };
    return tmp_res;
};

// function to sum the contents of the array
const sum = array => {
    let sum = 0;
    for (let i = 0, len = array.length; i < len; i++) {
      sum += array[i];
    }
    return sum;
  };

// ----------- prepare variables -------------
let participantID;
let numBlocks = 20;
let block = 1;
let numTrialInBlock = 20;
let trialInBlock = 1;
let totalTrial = 1;
let numFamiliar = Array(numBlocks).fill(3);
let numNovel = Array(numBlocks).fill(2);
numFamiliar[0] = 0; // no familiar stimuli at the first block
numNovel[0] = 5; // all stimuli are novel at the first block
let numMainStim = sum(numNovel);
let numPracStim = 4;
let numAllStim = numPracStim + numMainStim*2; // 4(practice) + 43 (main) * 2 (memory test)
let numExpose = Array(numMainStim).fill(0); // number of times each stimulus is presented
let numWin = Array(numMainStim).fill(0); // number of times win is observed (reset at each block)
let numLoss = Array(numMainStim).fill(0); // number of times loss is observed (reset at each block)
let stimInBlock = Array(numMainStim).fill(0); // 01array indicating five stimuli to be presented within the block
let stimIdxInBlock; // index indicating five stimuli to be presented within the block
let novelStimIdxInBlock;
let familiarStimIdxInBlock;
let familiarStim = Array(numMainStim).fill(0); // 01array indicating the familiar stimuli
let novelStim = Array(numMainStim).fill(1); // 01array indicating the novel stimuli
let familiarHoldoutIdx; // index of familiar holdout stimulus at that block
let novelHoldoutIdx; // index of novel holdout stimulus at that block
let familiarHoldout = Array(numMainStim).fill(0); // 01array indicating one familiar stimulus to be hold out
let novelHoldout = Array(numMainStim).fill(0); // 01array indicating one novel stimulus to be hold out
let stimOfTrial = Array(numMainStim).fill(0); // 01array indicating stimuli to present at that trial
let candidateStimOfTrial = Array(numMainStim).fill(0); // 01array indicating available stimuli to present at that trial
let candidateStimIdxOfTrial = [];
let stimIdxOfTrial; // index the stimulus presented at that trial
let novelHoldoutTrial; // the number of trial to introduce novel holdout stimulus
let familiarHoldoutTrial; // the number of trial to introduce familiar holdout stimulus
let condArray = Array(numBlocks/2).fill(0).concat(Array(numBlocks/2).fill(1));
condArray = jsPsych.randomization.shuffle(condArray); // 0: low reward, 1: high reward
let durChoice = 4000;
let durLightSelected = 1000;
let durCoin = 1000;
let durOutcome = 2000;
let pointInBlock;
let filename;
let rProbs = [0.2, 0.35, 0.5, 0.65, 0.8];
let holdoutTiming = [8, 9, 10, 11, 12, 13, 14, 15, 16];
let stim_l_index;
let stim_r_index;
let stim_l;
let stim_r;
let chosenStimIdx; // index indicating what number the stimulus is in stimIdxInBlock (0-4)
let rProbSelected; // true reward probability of selected stimulus
let pressedKey;
let isLeftSelected;
let isCoin; // whether coin was obtained or not
let reward; // presented size of reward
let largeMean = 50;
let smallMean = 5;
let largeSD = 10;
let smallSD = 1;


// load images
let all_stimuli = Array(numAllStim).fill("");
for (let k=1; k<numAllStim+1; k++) {
    let tmp = `stims_resized/p${k}.png`;
    all_stimuli[k-1] = tmp;
};
let bonus_slots = ["slots_and_coin/low_slot.png", "slots_and_coin/high_slot.png"];
let coin = ["slots_and_coin/COIN.png", "slots_and_coin/no_coin.png", "slots_and_coin/spin.gif"];
let all_img = all_stimuli.concat(bonus_slots, coin);
const preload = {
    type: jsPsychPreload,
    images: all_img
};

// randomize images to use
all_stimuli = jsPsych.randomization.shuffle(all_stimuli);
let main_stim = all_stimuli.slice(0, numMainStim);
let test_stim = all_stimuli.slice(numMainStim, numMainStim*2);
let prac_stim = all_stimuli.slice(numMainStim*2, numAllStim);

// decide stimuli to be presented at each trial and its reward probability
let presentedStim = Array(numBlocks*numTrialInBlock*2).fill(100);
presentedStim = slice_array(presentedStim, 2);
presentedStim = slice_array(presentedStim, numBlocks); // presentedStim[block][trial] -> ["stim1", "stim2"]
let stimIdxInBlockArray = Array(5*numBlocks).fill(100);
stimIdxInBlockArray = slice_array(stimIdxInBlockArray, 5);
stimIdxInBlockArray = slice_array(stimIdxInBlockArray, numBlocks); // stimIdxInBlockArray[block] = [5 stimuli in the block]
let rProbInBlockArray = Array(5*numBlocks).fill(100);
rProbInBlockArray = slice_array(stimIdxInBlockArray, 5);
rProbInBlockArray = slice_array(stimIdxInBlockArray, numBlocks); 
for (let bI=0; bI<numBlocks; bI++) {// bI=block ID
    // reset
    candidateStimOfTrial = Array(numMainStim).fill(0);
    stimInBlock = Array(numMainStim).fill(0);

    // determine five stimuli presented within the block
    let novelCandidateIdx = [];
    let familiarCandidateIdx = [];
    if (bI == 0) {// first block
        numExpose.filter((value, index) => {
            if (value == 0) {
                novelCandidateIdx.push(index);
            }
        });
        stimIdxInBlock = jsPsych.randomization.sampleWithoutReplacement(novelCandidateIdx, 5);
    } 
    else { // after the second block
        numExpose.filter((value, index) => {
            if (value == 0) {
                novelCandidateIdx.push(index);
            }
        });
        numExpose.filter((value, index) => {
            if (value > 3) {
                familiarCandidateIdx.push(index);
                //console.log(index);
            }
        });
        novelStimIdxInBlock = jsPsych.randomization.sampleWithoutReplacement(novelCandidateIdx, 2);
        familiarStimIdxInBlock = jsPsych.randomization.sampleWithoutReplacement(familiarCandidateIdx, 3);
        
        // choose holdout stimuli (1 each for familiar and novel)
        novelHoldoutIdx = novelStimIdxInBlock[1];
        familiarHoldoutIdx = familiarStimIdxInBlock[2];
        // add initial stimuli as available stimuli
        candidateStimOfTrial[novelStimIdxInBlock[0]] = 1;
        candidateStimOfTrial[familiarStimIdxInBlock[0]] = 1;
        candidateStimOfTrial[familiarStimIdxInBlock[1]] = 1;
        stimIdxInBlock = novelStimIdxInBlock.concat(familiarStimIdxInBlock);
        // determine the timing of introduction of holdout stimuli
        novelHoldoutTrial = jsPsych.randomization.sampleWithoutReplacement(holdoutTiming, 1);
        familiarHoldoutTrial = jsPsych.randomization.sampleWithoutReplacement(holdoutTiming, 1);
    };

    console.log(stimIdxInBlock);
    stimIdxInBlockArray[bI] = stimIdxInBlock;
    rProbs = jsPsych.randomization.shuffle(rProbs);
    rProbInBlockArray[bI] = rProbs;

    for (let tI=0; tI<numTrialInBlock; tI++) {// tI=trial ID (within the current block)
        stimOfTrial = Array(numMainStim).fill(0); // reset
        stimIdxOfTrial = [];
        candidateStimIdxOfTrial = [];
        if (bI == 0) {// first block
            stimIdxOfTrial = jsPsych.randomization.sampleWithoutReplacement(stimIdxInBlock, 2);
            presentedStim[bI][tI] = stimIdxOfTrial;
        }
        else {// after the second block
            // Check if this is the novel holdout introduction trial
            if (tI == novelHoldoutTrial) {// trial to introduce novel holdout stimulus
                stimOfTrial[novelHoldoutIdx] = 1;
                candidateStimOfTrial[novelHoldoutIdx] = 1;
            };
            
            // Check if this is the familiar holdout introduction trial
            if (tI == familiarHoldoutTrial) {// trial to introduce familiar holdout stimulus
                stimOfTrial[familiarHoldoutIdx] = 1;
                candidateStimOfTrial[familiarHoldoutIdx] = 1;
            }

            // find the candidate index to present
            candidateStimOfTrial = array_subtract(candidateStimOfTrial, stimOfTrial);
            candidateStimOfTrial.filter((value, index) => {
                if (value == 1) {
                    candidateStimIdxOfTrial.push(index);
                }
            });
            let numSample = 2 - sum(stimOfTrial);
            stimIdxOfTrial = jsPsych.randomization.sampleWithoutReplacement(candidateStimIdxOfTrial, numSample);
            //console.log(stimIdxOfTrial);
            stimOfTrial = replace_once(stimOfTrial, stimIdxOfTrial, 1);
            stimIdxOfTrial = [];
            stimOfTrial.filter((value, index) => {
                if (value == 1) {
                    stimIdxOfTrial.push(index);
                }
            });
            presentedStim[bI][tI] = jsPsych.randomization.shuffle(stimIdxOfTrial);
        };
        numExpose[presentedStim[bI][tI][0]] += 1;
        numExpose[presentedStim[bI][tI][1]] += 1;
    };
};
//console.log(presentedStim);

// ------------ For instruction ------------
const get_ID = {
    type: jsPsychSurveyText,
    questions: [
        {
            prompt: "あなたのIDを回答してください（実験実施者から通達された数字です）。",
            required: true,
            name: "participant_ID"
        }
    ],
    on_load: function() {
        let element = document.getElementById('input-0');
        element.type = 'number',
        element.min =0,
        element.max = 9999
    },
    on_finish: function(data) {
        participantID = data.response.participant_ID;
    }
};

const inst = { 
    type: jsPsychInstructions,
    pages: [
        "<img src='exp_explain/スライド1.PNG'>",
        "<img src='exp_explain/スライド2.PNG'>",
        "<img src='exp_explain/スライド3.PNG'>",
        "<img src='exp_explain/スライド4.PNG'>",
        "<img src='exp_explain/スライド5.PNG'>",
        "<img src='exp_explain/スライド6.PNG'>",
        "<img src='exp_explain/スライド7.PNG'>"
    ],
    key_forward: "j",
    key_backward: "f"
};


let slides = [
    'exp_explain/スライド1.PNG',
    'exp_explain/スライド2.PNG',
    'exp_explain/スライド3.PNG',
    'exp_explain/スライド4.PNG',
    'exp_explain/スライド5.PNG',
    'exp_explain/スライド6.PNG',
    'exp_explain/スライド7.PNG',
];

const preload2 = {
    type: jsPsychPreload,
    images: slides
};

// ------------- Trials ---------------
// show two stimuli and select one of them
const show_and_select = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        stim_l_index = presentedStim[block-1][trialInBlock-1][0];
        stim_r_index = presentedStim[block-1][trialInBlock-1][1];
        stim_l = main_stim[stim_l_index]; // left stim
        stim_r = main_stim[stim_r_index]; // right stim
        let html = `<p class='left_position'><img src=${stim_l}></p>`;
        html += `<p class='right_position'><img src=${stim_r}></p>`;
        return html;
    },
    choices: ["f", "j"],
    trial_duration: durChoice,
    on_finish: function() {
        pressedKey = jsPsych.data.get().last(1).values()[0].response;
        if (pressedKey == "f") {
            isLeftSelected = 1;
        } else if (pressedKey == "j") {
            isLeftSelected = 0;
        } else {// no response
            isLeftSelected = null
        }
    }
};

// Leave the selected stimulus and delete unselected stimulus
const highlight = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let html;
        if (pressedKey == "f") {// left stimulus is chosen
            html = `<p class='left_position'><img src=${stim_l}></p>`;
            html += "<p class='left_point'>左の絵を選びました。</p>"
        } else if (pressedKey == "j") { // right stimulus is chosen
            html = `<p class='right_position'><img src=${stim_r}></p>`;
            html += "<p class='right_point'>右の絵を選びました。</p>";
        } else {// no response
            html = "<p class='center'>時間切れです。</p>"
        };
        return html;
    },
    choices: "NO_KEYS",
    trial_duration: durLightSelected
};

// get coin or no coin
const get_coin = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus:function() {
        let html;
        // calculate reward probability
        if (pressedKey == null) {// no response
            html = "<p class='center'>時間切れです。</p>";
            isCoin = 0;
        } else {
            if (pressedKey == "f") {
                console.log(stimIdxInBlockArray[block-1]);
                stimIdxInBlockArray[block-1].filter((value, index) => {
                    if (value == stim_l_index) {
                        chosenStimIdx = index
                    }
                });
            } else if (pressedKey == "j") {
                stimIdxInBlockArray[block-1].filter((value, index) => {
                    if (value == stim_r_index) {
                        chosenStimIdx = index
                    }
                });
            };
            rProbSelected = rProbInBlockArray[block-1][chosenStimIdx];
            console.log(stimIdxInBlockArray[block-1]);
            console.log(stim_l_index);
            console.log(chosenStimIdx);
            console.log(rProbSelected);
            // present coin or not
            if (Math.random() < rProbSelected) {// get coin
                isCoin = 1;
                html = "<p class='center'><img src='slots_and_coin/COIN.png'></p>";
                html += "<p class='center_upper'><b>コインを獲得しました！</b><br><br>ボーナススロットを回せます。</p>"
            } else { // no coin
                isCoin = 0;
                html = "<p class='center'><img src='slots_and_coin/no_coin.png'></p>";
                html += "<p class='center_upper'>残念…コインを得られませんでした。</p>"
            };
        };
        return html;
    },
    choices: "NO_KEYS",
    trial_duration: function() {
        let td;
        if (pressedKey == null) {
            td = 50
        } else {
            td = durCoin
        };
        return td;
    }
};

// present bonus slot machine (or not)
const present_bonus_slot = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let html;
        if (isCoin == 0) {// no coin or no response
            html = "<p class='center'>+</p>";
        } else {// present bonus slot machine
            if (condArray[block-1] == 0) {// low reward
                html = "<p class='center'><img src='slots_and_coin/low_slot.png'></p>";
            } else {// high reward
                html = "<p class='center'><img src='slots_and_coin/high_slot.png'></p>";
            };
            html += "<p class='slot_inst'>スペースキーを押してスロットを回してください。</p>"
        };
        return html;
    },
    choices: [" "],
    trial_duration: function() {
        let td;
        if (isCoin == 0) {
            td = 0;
        } else {
            td = durChoice;
        };
        return td;
    }
};

// spin bonus slot when needed
const spin_bonus_slot = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let html;
        if (isCoin == 0) {
            html = "<p class='center'>+</p>";
        } else {
            html = "<p class='center'><img src='slots_and_coin/spin.gif'></p>"
        };
        return html;
    },
    choices: "NO_KEYS",
    trial_duration: function() {
        let td;
        if (isCoin == 0) {
            td = 0;
        } else {
            td = runif(600, 1200);
        };
        return td;
    }
};

// show outcome
const show_outcome = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let html;
        if (isCoin == 0) {
            html = "<p class='center'>+</p>";
        } else {
            if (condArray[block-1] == 0) {// low reward
                reward = Math.round(rnorm(smallMean, smallSD, 1));
            } else {
                reward = Math.round(rnorm(largeMean, largeSD, 1));
            };
            html = `<p class='center'><b>${reward}円</b>を獲得しました！</p>`;
        };
        return html;
    },
    choices: "NO_KEYS",
    trial_duration: function() {
        let td;
        if (isCoin == 0) {
            td = 0;
        } else {
            td = durOutcome;
        };
        return td;
    }
};

// ITI
const ITI = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let html = "<p class='center'>+</p>";
        return html;
    },
    choices: "NO_KEYS",
    trial_duration: runif(500, 1500)
};

// timeline to save data using pipeline
const save_data = {
    type: jsPsychPipe,
    action: "save",
    experiment_id: "tjizeNPN1ukz",
    filename: function() {
        filename = `${participantID}_${exp_num}.csv`;
        return(filename);
    },
    data_string: ()=>jsPsych.data.get().csv()
  };

// timeline for full experiment
const full_exp = {
    timeline: [
        preload,
        //start_FS,
        ITI,
        show_and_select,
        highlight,
        get_coin,
        present_bonus_slot,
        spin_bonus_slot,
        show_outcome
    ]
};

const timeline = [full_exp];

// start the experiment
jsPsych.run(timeline);