// 2023/10/20 ver. Without interleaving the high and low blocks
// High -> Low or Low -> High
// 15 blocks for each condition

// exploration (multi-armed bandit) task modified based on Cockburn et al. (2022)
// 5 stimuli in each block, 3 familiar + 2 novel
// 20 trials in each block * 20 blocks
// present 2 stimuli randomly at each trial
// Initial set: 2 familiar + 1 novel
// Holdout set: 1 familiar + 1 novel
// Holdout stimuli will be introduced randomly after 8 trials
// familiar stimulus is defined as the stimulus presented more than 4 times


const jsPsych = initJsPsych({
    on_finish: function()
    {
        //jsPsych.data.displayData("csv")

        // output data in the form of csv
        jsPsych.data.get().localSave("csv", "data.csv")
    }
});

let start_FS = {// fullscreen
    type: jsPsychFullscreen,
    message: '<p>ウィンドウサイズを最大化します。下のボタンを押してください。</p>',
    button_label: 'ここをクリックしてください',
    fullscreen_mode: true 
};

// ============ informed consent ==============
// text for informed consent
const informedConsentText = [// p: paragraph, b: bold, br: start new line
    '<div style = "font-size: 3vh; text-align: left; line-hight: normal"><p>本日は，実験へのご参加を検討していただき誠にありがとうございます。本実験への参加はあなたの任意によるものです。</p>' +
    '<p><b>1.本実験・調査の目的と概要</b>' +
    '<br>この研究の目的は，ヒトの学習・行動選択のメカニズムおよびその個人特性との関連を検討することです。'  +
    '<br>本日は簡単な質問紙調査ののちに，行動実験に取り組んでいただきます。'+
    '<br>所要時間は90-120分程度を予定しています。</p>' +
    '<p><b>2.同意の撤回について</b>' +
    '<br>本実験は大きなストレスや苦痛を伴うものではありませんが，いかなる理由で同意を撤回し，実験を途中で中断・終了されても，' +
    '<br>また，実験終了後にデータ使用の中止を申し出ても，あなたが不利益を被ることはありません。' +
    '<br>ただし，データが論文・学会等で発表され，あるいはデータベース等に登録・提供された後には，使用を中止することができなくなります。</p>' + 
    '<p><b>3.匿名性の確保</b>' +
    '<br>データは匿名化し，研究目的にのみ使用し，統計的に処理します。' +
    '<br>学会発表や論文においてデータを公表すること，今後の利用のためにデータをデータベース等に登録・提供することが考えられますが，' +
    '<br>個人が特定されることは決してありません。' +
    '<br>実験上知り得た個人情報については細心の注意を払って保管し，研究以外の目的には決して使用しません。</p>' +
    '<p><b>4.実験実施者・責任者への問い合わせ</b>' +
    '<br>【研究実施者】' +
    '<br>東京大学大学院教育学研究科' +
    '<br>大学院生　下村 寛治 (shimomura-kanji575@g.ecc.u-tokyo.ac.jp)' +
    '<br>【研究責任者】' +
    '<br>東京大学大学院教育学研究科' +
    '<br>准教授　森田 賢治 (morita@p.u-tokyo.ac.jp)</p></div>'
];

// timeline for informed consent
const informedConsent = {
    type: jsPsychSurveyMultiSelect,
    questions: [{
        prompt: '<span style = "font-size: 3vh"><b>上記事項をよく読み，理解した上で実験参加に同意いただける方はチェックをお願いします。同意されない方はエスケープ（ESC）を押した後，ウィンドウを閉じてください。</b></span>',
        options: ['<span style = "font-size: 3vh">説明事項をよく読み，理解した上で，実験参加に同意します。</span>'],
        required: true,
        name: 'approval'
    }],
    preamble: informedConsentText,
    button_label: '次へ'
};

// =========== prepare necessary functions ===========
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

// function to decide stimuli to be presented at each trial and its reward probability
function decide_stim_and_rProb(numCondBlocks, numTrialInBlock, numCondStim,
    rProbs, holdoutTiming) {
    // prepare variables to use
    // ----- variables to return -----
    let presentedStim = Array(numCondBlocks*numTrialInBlock*2).fill(100);
    presentedStim = slice_array(presentedStim, 2);
    presentedStim = slice_array(presentedStim, numTrialInBlock); // presentedStim[block][trial] -> ["stim1", "stim2"]
    let stimIdxInBlockArray = Array(5*numCondBlocks).fill(100);
    stimIdxInBlockArray = slice_array(stimIdxInBlockArray, 5);
    stimIdxInBlockArray = slice_array(stimIdxInBlockArray, numTrialInBlock); // stimIdxInBlockArray[block] = [5 stimuli in the block]
    let rProbInBlockArray = Array(5*numCondBlocks).fill(100);
    rProbInBlockArray = slice_array(stimIdxInBlockArray, 5);
    rProbInBlockArray = slice_array(stimIdxInBlockArray, numTrialInBlock);

    // ------ variables needed in the function -------
    let numExpose = Array(numCondStim).fill(0); // number of times each stimulus is presented
    let stimIdxInBlock; // index indicating five stimuli to be presented within the block
    let novelStimIdxInBlock; // index indicating two novel stimuli in the block
    let familiarStimIdxInBlock; // index indicating three familiar stimuli in the block
    let novelHoldoutIdx;
    let familiarHoldoutIdx;
    let candidateStimOfTrial = Array(numCondStim).fill(0); // 01array indicating available stimuli to present at that trial
    let novelHoldoutTrial; // the number of trial to introduce novel holdout stimulus
    let familiarHoldoutTrial; // the number of trial to introduce familiar holdout stimulus
    let stimOfTrial = Array(numCondStim).fill(0); // 01array indicating stimuli to present at that trial
    let stimIdxOfTrial; // index of the stimulus presented at that trial
    let candidateStimIdxOfTrial = [];

    // ------- decide stimuli to present --------
    for (let bI=0; bI<numCondBlocks; bI++) {// bI=block ID
        // reset
        candidateStimOfTrial = Array(numCondStim).fill(0);
    
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
    
        //console.log(stimIdxInBlock);
        stimIdxInBlockArray[bI] = stimIdxInBlock;
        rProbs = jsPsych.randomization.shuffle(rProbs);
        rProbInBlockArray[bI] = rProbs;
    
        for (let tI=0; tI<numTrialInBlock; tI++) {// tI=trial ID (within the current block)
            stimOfTrial = Array(numCondStim).fill(0); // reset
            stimIdxOfTrial = [];
            candidateStimIdxOfTrial = [];
            if (bI == 0) {// first block
                stimIdxOfTrial = jsPsych.randomization.sampleWithoutReplacement(stimIdxInBlock, 2);
                presentedStim[bI][tI] = stimIdxOfTrial;
            }
            else {// after the second block
                // Check if this is the novel holdout introduction trial
                if (tI == novelHoldoutTrial-1) {// trial to introduce novel holdout stimulus
                    console.log("Novel holdout introduction");
                    candidateStimOfTrial[novelHoldoutIdx] = 1;
                    stimOfTrial[novelHoldoutIdx] = 1;
                };
                
                if (tI > novelHoldoutTrial-1) {
                    candidateStimOfTrial[novelHoldoutIdx] = 1;
                };

                // Check if this is the familiar holdout introduction trial
                if (tI == familiarHoldoutTrial-1) {// trial to introduce familiar holdout stimulus
                    console.log("Familiar holdout introduction");
                    stimOfTrial[familiarHoldoutIdx] = 1;
                    candidateStimOfTrial[familiarHoldoutIdx] = 1;
                };

                if (tI > familiarHoldoutTrial-1) {
                    candidateStimOfTrial[familiarHoldoutIdx] = 1;
                };
    
                // find the candidate index to present
                console.log(candidateStimOfTrial);
                console.log(stimOfTrial);
                candidateStimOfTrial = array_subtract(candidateStimOfTrial, stimOfTrial);
                console.log(candidateStimOfTrial);
                candidateStimOfTrial.filter((value, index) => {
                    if (value == 1) {
                        candidateStimIdxOfTrial.push(index);
                    }
                });
                let numSample = 2 - sum(stimOfTrial);
                stimIdxOfTrial = jsPsych.randomization.sampleWithoutReplacement(candidateStimIdxOfTrial, numSample);
                console.log(candidateStimIdxOfTrial);
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

    return [presentedStim, stimIdxInBlockArray, rProbInBlockArray];
};

// =========== prepare variables ===========
let participantID = jsPsych.randomization.randomID(8); // generate randomly
let numCondBlocks = 15;
let numBlocks = numCondBlocks*2; // 30
let block = 1;
let blockCond = 1;
let numTrialInBlock = 20;
let trialInBlock = 1;
let totalTrial = 1;
let pointInBlock = 0;
let numFamiliar = Array(numCondBlocks).fill(3);
let numNovel = Array(numCondBlocks).fill(2);
numFamiliar[0] = 0; // no familiar stimuli at the first block
numNovel[0] = 5; // all stimuli are novel at the first block
let numCondStim = sum(numNovel); // 5+2*14=33
let numMainStim = numCondStim*2; // 33*2=66
let numPracStim = 5;
let numMemoryStim = 30;
let numAllStim = numPracStim + numMainStim + numMemoryStim; // 5(practice) + 66 (main) + 30 (memory test)
let rProbs = [0.2, 0.35, 0.5, 0.65, 0.8];
let holdoutTiming = [8, 9, 10, 11, 12, 13, 14, 15, 16];
let numWinLow = Array(numCondStim).fill(0); // number of times win is observed (reset at each block)
let numLossLow = Array(numCondStim).fill(0); // number of times loss is observed (reset at each block)
let numWinHigh = Array(numCondStim).fill(0); // number of times win is observed (reset at each block)
let numLossHigh = Array(numCondStim).fill(0); // number of times loss is observed (reset at each block)
let numExposeLow = Array(numCondStim).fill(0); // number of times the stimulus is observed
let numExposeHigh = Array(numCondStim).fill(0);
let condArrayLowFirst = Array(numBlocks/2).fill(0).concat(Array(numCondBlocks).fill(1));
let condArrayHighFirst = Array(numBlocks/2).fill(1).concat(Array(numCondBlocks).fill(0)); // 0: low reward, 1: high reward
let low_res = decide_stim_and_rProb(numCondBlocks, numTrialInBlock, numCondStim, rProbs, holdoutTiming);
let high_res = decide_stim_and_rProb(numCondBlocks, numTrialInBlock, numCondStim, rProbs, holdoutTiming);
let presentedStimLow = low_res[0];
let presentedStimHigh = high_res[0];
let stimIdxInBlockArrayLow = low_res[1];
let stimIdxInBlockArrayHigh = high_res[1];
let rProbInBlockArrayLow = low_res[2];
let rProbInBlockArrayHigh = high_res[2];
let durChoice = 4000;
let durLightSelected = 1000;
let durCoin = 1000;
let durOutcome = 2000;
let filename;
let stim_l_index;
let stim_r_index;
let stim_l;
let stim_r;
let chosenStim; // the index number of the chosen stimulus (0-33)
let unchosenStim;
let chosenStimIdx; // index indicating what number the stimulus is in stimIdxInBlock (0-4)
let unchosenStimIdx;
let rProbSelected; // true reward probability of selected stimulus
let pressedKey;
let isLeftSelected;
let isCoin; // whether coin was obtained or not
let reward; // presented size of reward
let largeMean = 100;
let smallMean = 10;
let largeSD = 10;
let smallSD = 1;
let cesd_qs = [
    "普段はなんでもないことがわずらわしい。",
    "食べたくない。食欲が落ちた。",
    "家族や友人からはげましてもらっても，気分が晴れない。",
    "他の人と同じ程度には，能力があると思う", // reverse, 3
    "物事に集中できない。",
    "ゆううつだ。",
    "何をするのも面倒だ。",
    "これから先のことについて，積極的に考えることができる。", // reverse, 7
    "過去のことについて，くよくよ考える。",
    "何か恐ろしい気持ちがする。",
    "なかなか眠れない。",
    "生活について不満なく過ごせる。", // reverse, 11
    "普段より口数が少ない。口が重い。",
    "一人ぼっちでさびしい。",
    "皆がよそよそしいと思う。",
    "毎日が楽しい。", // reverse, 15
    "急に泣き出すことがある。",
    "悲しいと感じる。",
    "皆が自分を嫌っていると感じる。",
    "仕事が手につかない。", 
    "1日のうちに100mL以上の水分を摂取した。" // trick question, 20
];
let cesdTrial = 1;
let cesdTrialNum = cesd_qs.length;
let cesdAns;
let cesdSum = 0;
let som_qs = [
    "私はいま，人生における困難について楽観的な気持ちでいる。",
    "私はいま，物事がすべてうまくいくと期待している。",
    "私はいま，自分の将来に対して楽観的な気持ちでいる。",
    "私は今日（ここから24時間以内に）何か良いことが起こるだろうと感じている。",
    "私にはいま，未来が明るく見えている。",
    "私はいま，自分の将来において，うまくいかないことよりも，うまくいくことの方が多いだろうと期待している。",
    "私はいま，物事が良い方向へ向かうだろうと期待している。"
];
let somTrial = 1;
let somTrialNum = som_qs.length;
let somAns;
let somSum = 0;

// decide the order (low -> high, high -> low) of condition randomly
let condArray;
if (Math.random() < 0.5) {
    condArray = condArrayHighFirst;
} else {
    condArray = condArrayLowFirst;
};

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
let main_stim = all_stimuli.slice(0, numCondStim*2);
let main_stim_l = all_stimuli.slice(0, numCondStim); // stimuli for low reward cond
let main_stim_h = all_stimuli.slice(numCondStim, numCondStim*2); // stimuli for high reward cond
let test_stim = all_stimuli.slice(numCondStim*2, numCondStim*2+numMemoryStim);
let prac_stim = all_stimuli.slice(numCondStim*2+numMemoryStim, numAllStim);
main_stim = jsPsych.randomization.shuffle(main_stim); // shuffle the order for the memory test

// ========== inform ID ============
const inform_ID = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let html;
        html = `<p class='inst_text'>あなたのIDは，"<b>${participantID}</b>"です。<br>`;
        html += "(数字の 1 とアルファベット小文字の l (エル)はこのように表記が違いますので，注意してください。)<br>"
        html += "お伝えしたように，この番号は実験終了後実験実施者に伝えていただく";
        html += "ものですので，必ずメモを取って忘れないようにしてください。<br>";
        html += "メモを取れたら，スペースキーを押して次の質問紙の回答へ進んでください。";
        return html;
    },
    choices: [" "]
};

// =========== Questionnaire =============
// CES-D
let cesd_inst = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let text;
        text = "<p class='inst_text'>それでは，次の質問です。<br>";
        text += "この1週間の，あなたのからだや心の状態についてお聞きします。<br>";
        text += "これから順に呈示する20項目について，もし，<b>この1週間で</b>全くないか，";
        text += "あったとしても1日も続かない場合には「ない (1日未満)」を，週のうち1～2日，";
        text += "3～4日，5日以上の時は，それぞれ当てはまるものを選択してください。<br>";
        text += "<b>選択はA，B，C，Dのキーを押して</b>行ってください。<br>";
        text += "準備ができたら，スペースキーを押して回答を始めてください。</p>";
        return text;
    },
    choices: [" "]
};

let cesd_qs_index = [];
for (let k=0; k<cesd_qs.length; k++) {
    cesd_qs_index.push(k);
};
cesd_qs_index = jsPsych.randomization.shuffle(cesd_qs_index);

let cesd_single = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let text;
        let idx = cesd_qs_index[cesdTrial-1];
        text = `<p class='q_main'>${cesd_qs[idx]}</p>`;
        text += "<p class='q_option'>A: ない (1日未満)<br>";
        text += "B: 1～2日<br>";
        text += "C: 3～4日<br>";
        text += "D: 5日以上<br>";
        return text;
    },
    choices: ["a", "b", "c", "d"],
    on_finish: function(data) {
        pressedKey = jsPsych.data.get().last(1).values()[0].response;
        let idx = cesd_qs_index[cesdTrial-1];
        let cesdType;
        if (pressedKey == "a") {
            cesdAns = 0;
        } else if (pressedKey == "b") {
            cesdAns = 1;
        } else if (pressedKey == "c") {
            cesdAns = 2;
        } else {
            cesdAns = 3;
        };
        if (idx == 3 || idx == 7 || idx == 11 || idx == 15) {
            // reverse
            cesdAns = 3 - cesdAns;
            cesdType = "reverse";
        } else if (idx == 20) {
            cesdType = "trick";
        } else {
            cesdType = "normal";
        };
        if (cesdType == "trick") {
            cesdSum += 0; // don't sum
        } else {
            cesdSum += cesdAns;
        }
        data.timing = "CES-D";
        data.cesd_trialNum = cesdTrial;
        data.cesd_idx = idx;
        data.cesd_type = cesdType;
        data.cesd_ans = cesdAns;
        data.cesd_sum = cesdSum;
    }
};

const cesd_multi = {
    timeline: [cesd_single],
    loop_function: function() {
        if (cesdTrial < cesdTrialNum) {
            cesdTrial += 1;
            return true;
        } else {
            return false;
        }
    }
};

const cesd_block = {
    timeline: [
        cesd_inst,
        cesd_multi
    ]
};

// J-SOM
let som_inst = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let text;
        text = "<p class='inst_text'>これから順に呈示する項目についてどのように感じるかを，<b>たった今，";
        text += "この瞬間に</b>どのように感じるかに基づいて，5段階から選んでお答えください。<br>";
        text += "各項目について，それより前の項目のことは考えず，その項目一つに対する感覚に基づいて，";
        text += "できる限り正確に応えるようにしてください。<br>";
        text += "<b>選択は1から5のキーを押して</b>行ってください。<br>";
        text += "準備ができたら，スペースキーを押して回答を始めてください。</p>";
        return text;
    },
    choices: [" "]
};

let som_qs_index = [];
for (let k=0; k<som_qs.length; k++) {
    som_qs_index.push(k);
};
som_qs_index = jsPsych.randomization.shuffle(som_qs_index);

let som_single = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let text;
        let idx = som_qs_index[somTrial-1];
        text = `<p class='q_main'>${som_qs[idx]}</p>`;
        text += "<p class='q_option'>1 強くそう思わない<br>";
        text += "2<br>";
        text += "3<br>";
        text += "4<br>";
        text += "5 強くそう思う</p>";
        return text;
    },
    choices: ["1", "2", "3", "4", "5"],
    on_finish: function(data) {
        pressedKey = jsPsych.data.get().last(1).values()[0].response;
        somAns = Number(pressedKey);
        somSum += somAns;
        let idx = som_qs_index[somTrial-1];
        data.timing = "SOM";
        data.som_trialNum = somTrial;
        data.som_idx = idx;
        data.som_ans = somAns;
        data.som_sum = somSum;
    }
};

const som_multi = {
    timeline: [som_single],
    loop_function: function() {
        if (somTrial < somTrialNum) {
            somTrial += 1;
            return true;
        } else {
            return false;
        }
    }
};

const som_block = {
    timeline: [
        som_inst,
        som_multi
    ]
};

// =========== For instruction ===========
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

const first_inst = {
    type: jsPsychInstructions,
    pages: [
        "<img src='introduction/スライド1.PNG'>",
        "<img src='introduction/スライド2.PNG'>"
    ],
    key_forward: "j",
    key_backward: "f"
};

const inst_after_prac = {
    type: jsPsychInstructions,
    pages: function() {
        let pages = [
            "<img src='introduction/スライド3.PNG'>",
            "<img src='introduction/スライド4.PNG'>"
        ];
        if (condArray[0] == 1) {// starts with high reward
            pages.push("<img src='introduction/スライド5.PNG'>");
            pages.push("<img src='introduction/スライド7.PNG'>");
        } else {
            pages.push("<img src='introduction/スライド6.PNG'>");
            pages.push("<img src='introduction/スライド8.PNG'>");
        };
        pages.push("<img src='introduction/スライド9.PNG'>");
        pages.push("<img src='introduction/スライド10.PNG'>");
        pages.push("<img src='introduction/スライド11.PNG'>");
        pages.push("<img src='introduction/スライド12.PNG'>");
        return pages;
    },
    key_forward: "j",
    key_backward: "f"
};

const inst_memory = {
    type: jsPsychInstructions,
    pages: [
        "<img src='introduction/スライド13.PNG'>",
        "<img src='introduction/スライド14.PNG'>",
        "<img src='introduction/スライド15.PNG'>"
    ],
    key_forward: "j",
    key_backward: "f"
};

let slideNum = 15;
let all_slides = Array(slideNum).fill("");

for (let k=1; k<slideNum+1; k++) {
    all_slides[k-1] = `introduction/スライド${k}.PNG`;
};

const preload2 = {
    type: jsPsychPreload,
    images: all_slides
};

// =========== Practices =============
let trialPrac = 1;
let trialNumPrac = 10;
let condPrac = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
let outcomePracLow = [1, 1, 1, 0, 0];
let outcomePracHigh = [1, 1, 1, 0, 0];
outcomePracLow = jsPsych.randomization.shuffle(outcomePracLow);
outcomePracHigh = jsPsych.randomization.shuffle(outcomePracHigh);
let isCoinPrac;

// ITI
const ITI = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let html = "<p class='center_point'>+</p>";
        html += `<p class='upper_right'>このカジノで得た金額：<br><b>${pointInBlock}</b>円</p>`;
        return html;
    },
    choices: "NO_KEYS",
    trial_duration: runif(500, 1500)
};

const show_and_select_prac = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let html;
        prac_stim = jsPsych.randomization.shuffle(prac_stim);
        stim_l = prac_stim[0];
        stim_r = prac_stim[1];
        html = `<p class='left_position'><img src=${stim_l}></p>`;
        html += `<p class='right_position'><img src=${stim_r}></p>`;
        html += "<p class='left_point'>F</p>";
        html += "<p class='right_point'>J</p>";
        html += `<p class='upper_right'>このカジノで得た金額：<br><b>${pointInBlock}</b>円</p>`;
        return html;
    },
    choices: ["f", "j"],
    trial_duration: durChoice,
    on_finish: function(data) {
        data.timing = "practice";
        // get response
        pressedKey = jsPsych.data.get().last(1).values()[0].response;
        if (pressedKey == "f") {
            isLeftSelected = 1;
            chosenStim = stim_l_index;
            unchosenStim = stim_r_index;
        } else if (pressedKey == "j") {
            isLeftSelected = 0;
            chosenStim = stim_r_index;
            unchosenStim = stim_l_index;
        } else {// no response
            isLeftSelected = null
            chosenStim = null;
            unchosenStim = null;
        };
    }
}; 

const highlight_prac = {
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
            html = "<p class='center_point'>時間切れです。<br>";
            html += "4秒以内に選択してください。</p>";
        };
        return html;
    },
    choices: "NO_KEYS",
    trial_duration: durLightSelected
};

const get_coin_prac = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let html;
        if (condPrac[trialPrac-1] == 0) {
            isCoinPrac = outcomePracLow[trialPrac-1];
        } else {
            isCoinPrac = outcomePracHigh[(trialPrac-5)-1];
        };
        if (isCoinPrac == 1) {
            html = "<p class='center'><img src='slots_and_coin/COIN.png'></p>";
            html += "<p class='center_upper'><b>コインを獲得しました！</b><br><br>ボーナススロットを回せます。</p>"
        } else {
            html = "<p class='center'><img src='slots_and_coin/no_coin.png'></p>";
            html += "<p class='center_upper'>残念…コインを得られませんでした。</p>";
        };
        return html;
    },
    choices: "NO_KEYS",
    trial_duration: durCoin
};

const present_bonus_slot_prac = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let html;
        //console.log(trialPrac);
        if (isCoinPrac == 0) {// no coin or no response
            html = "<p class='center_point'>+</p>";
        } else {// present bonus slot machine
            if (condPrac[trialPrac-1] == 0) {// low reward
                html = "<p class='center'><img src='slots_and_coin/low_slot.png'></p>";
            } else {// high reward
                html = "<p class='center'><img src='slots_and_coin/high_slot.png'></p>";
            };
            html += "<p class='slot_inst'>スペースキーを押して<br>スロットを回してください。</p>"
        };
        return html;
    },
    choices: [" "],
    trial_duration: function() {
        let td;
        if (isCoinPrac == 0) {
            td = 0;
        } else {
            td = durChoice;
        };
        return td;
    }
};

const spin_bonus_slot_prac = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let html;
        if (isCoinPrac == 0) {
            html = "<p class='center_point'>+</p>";
        } else {
            html = "<p class='center'><img src='slots_and_coin/spin.gif'></p>"
        };
        return html;
    },
    choices: "NO_KEYS",
    trial_duration: function() {
        let td;
        if (isCoinPrac == 0) {
            td = 0;
        } else {
            td = runif(800, 1200);
        };
        return td;
    }
};

const show_outcome_prac = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let html;
        if (isCoinPrac == 0) {
            html = "<p class='center_point'>+</p>";
        } else {
            if (condPrac[trialPrac-1] == 0) {// low reward
                reward = Math.round(rnorm(smallMean, smallSD, 1));
                pointInBlock += reward;
            } else { // high reward
                reward = Math.round(rnorm(largeMean, largeSD, 1));
                pointInBlock += reward;
            };
            html = `<p class='center_point'><b>${reward}円</b><br>獲得しました！</p>`;
        };
        return html;
    },
    choices: "NO_KEYS",
    trial_duration: function() {
        let td;
        if (isCoinPrac == 0) {
            td = 0;
        } else {
            td = durOutcome;
        };
        return td;
    }
};

const trial_prac_low = {
    timeline: [
        ITI,
        show_and_select_prac,
        highlight_prac,
        get_coin_prac,
        present_bonus_slot_prac,
        spin_bonus_slot_prac,
        show_outcome_prac
    ],
    loop_function: function() {
        if (trialPrac < trialNumPrac/2) {
            trialPrac += 1;
            return true;
        } else {
            trialPrac += 1;
            pointInBlock = 0;
            return false;
        };
    }
};

const text_between_prac = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: "<p class='inst_text'>次のカジノへ移動します。スペースキーを押してください。</p>",
    choices: [" "]
};

const trial_prac_high = {
    timeline: [
        ITI,
        show_and_select_prac,
        highlight_prac,
        get_coin_prac,
        present_bonus_slot_prac,
        spin_bonus_slot_prac,
        show_outcome_prac
    ],
    loop_function: function() {
        if (trialPrac < trialNumPrac) {
            trialPrac += 1;
            return true;
        } else {
            pointInBlock = 0;
            return false;
        };
    }
};

// timeline for practice block
const prac_block = {
    timeline: [
        trial_prac_low,
        text_between_prac,
        trial_prac_high
    ]
};

// timeline for confirmation questions
let qTrial = 1;
let qTrialNum = 5;
let qCorrect;
let qCorrectNum = 0;
let questions = [
    "<img src='Q&A/スライド1.PNG'>",
    "<img src='Q&A/スライド4.PNG'>",
    "<img src='Q&A/スライド7.PNG'>",
    "<img src='Q&A/スライド10.PNG'>",
    "<img src='Q&A/スライド13.PNG'>"
];

let correctAns = [
    "<img src='Q&A/スライド2.PNG'>",
    "<img src='Q&A/スライド5.PNG'>",
    "<img src='Q&A/スライド8.PNG'>",
    "<img src='Q&A/スライド11.PNG'>",
    "<img src='Q&A/スライド14.PNG'>"
];

let incorrectAns = [
    "<img src='Q&A/スライド3.PNG'>",
    "<img src='Q&A/スライド6.PNG'>",
    "<img src='Q&A/スライド9.PNG'>",
    "<img src='Q&A/スライド12.PNG'>",
    "<img src='Q&A/スライド15.PNG'>"
];

const ask_question = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let html = questions[qTrial-1];
        return html;
    },
    choices: ["a", "b", "c"],
    on_finish: function() {
        console.log(qTrial);
        pressedKey = jsPsych.data.get().last(1).values()[0].response;
        if (pressedKey == "b") {
            if (qTrial == 1 || qTrial == 4) {
                qCorrect = 1;
            } else {
                qCorrect = 0;
            };
        } else if (pressedKey == "c") {
            if (qTrial == 3 || qTrial == 5) {
                qCorrect = 1;
            } else {
                qCorrect = 0;
            };
        } else {
            if (qTrial == 2) {
                qCorrect = 1;
            } else {
                qCorrect = 0;
            };
        }
        qCorrectNum += qCorrect;
    }
};

const show_answer = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let html;
        if (qCorrect == 1) {
            html = correctAns[qTrial-1];
        } else {
            html = incorrectAns[qTrial-1];
        };
        html += "<p class='center_lower'>次に進むにはJキーを押してください。<br>";
        if (qTrial == 5) {
            html += "全問正解でない場合は，最初の質問に戻ります。<p>";
        };
        qTrial += 1;
        return html;
    },
    choices: ["j"]
};

const confirmation = {
    timeline: [
        ask_question,
        show_answer
    ],
    loop_function: function() {
        if (qTrial < qTrialNum+1) {
            return true;
        } else {
            return false;
        }
    }
};

const confirmation_repeat = {
    timeline: [confirmation],
    loop_function: function() {
        if (qCorrectNum < qTrialNum) {
            qTrial = 1;
            qCorrectNum = 0; // reset
            return true;
        } else {// qCorrectNum = 5
            return false;
        }
    }
};

let QAslides = Array(15).fill("");
for (let k=0; k<15; k++) {
    QAslides[k] = `Q&A/スライド${k+1}.PNG`;
};

const preload3 = {
    type: jsPsychPreload,
    images: QAslides
};

// =========== Main Trials ===========
// show two stimuli and select one of them
const show_and_select = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let html;
        if (condArray[block-1] == 0) {// low reward
            stim_l_index = presentedStimLow[blockCond-1][trialInBlock-1][0];
            stim_r_index = presentedStimLow[blockCond-1][trialInBlock-1][1];
            stim_l = main_stim_l[stim_l_index]; // left stim
            stim_r = main_stim_l[stim_r_index]; // right stim
        } else {// high reward
            stim_l_index = presentedStimHigh[blockCond-1][trialInBlock-1][0];
            stim_r_index = presentedStimHigh[blockCond-1][trialInBlock-1][1];
            stim_l = main_stim_h[stim_l_index]; // left stim
            stim_r = main_stim_h[stim_r_index]; // right stim
        }
        html = `<p class='left_position'><img src=${stim_l}></p>`;
        html += `<p class='right_position'><img src=${stim_r}></p>`;
        html += "<p class='left_point'>F</p>";
        html += "<p class='right_point'>J</p>";
        html += `<p class='upper_right'>このカジノで得た金額：<br><b>${pointInBlock}</b>円<br><p>`;
        html += `<p class='trial_pos'><b>${trialInBlock}</b>  /20試行`;
        return html;
    },
    choices: ["f", "j"],
    trial_duration: durChoice,
    on_finish: function(data) {
        // get response
        pressedKey = jsPsych.data.get().last(1).values()[0].response;
        if (pressedKey == "f") {
            isLeftSelected = 1;
            chosenStim = stim_l_index;
            unchosenStim = stim_r_index;
        } else if (pressedKey == "j") {
            isLeftSelected = 0;
            chosenStim = stim_r_index;
            unchosenStim = stim_l_index;
        } else {// no response
            isLeftSelected = null
            chosenStim = null;
            unchosenStim = null;
        };

        // record
        data.participantID = participantID;
        data.blockNumInCond = blockCond;
        data.blockNumTotal = block;
        data.trialNumInBlock = trialInBlock;
        data.trialNumTotal = totalTrial;
        data.blockCond = condArray[block-1];
        data.timing = "first_choice";
        data.leftStim = stim_l_index;
        data.rightStim = stim_r_index;
        data.leftStimOriginal = stim_l;
        data.rightStimOriginal = stim_r;
        data.isLeftSelected = isLeftSelected;
        if (condArray[block-1] == 0) {
            console.log(stimIdxInBlockArrayLow[block-1]);
            data.numExposeLeft = numExposeLow[stim_l_index];
            data.numExposeRight = numExposeLow[stim_r_index];
            data.numWinLeft = numWinLow[stim_l_index];
            data.numWinRight = numWinLow[stim_r_index];
            data.numLossLeft = numLossLow[stim_l_index];
            data.numLossRight = numLossLow[stim_r_index];
        } else if (condArray[block-1] == 1) {
            console.log(stimIdxInBlockArrayHigh[block-1]);
            data.numExposeLeft = numExposeHigh[stim_l_index];
            data.numExposeRight = numExposeHigh[stim_r_index];
            data.numWinLeft = numWinHigh[stim_l_index];
            data.numWinRight = numWinHigh[stim_r_index];
            data.numLossLeft = numLossHigh[stim_l_index];
            data.numLossRight = numLossHigh[stim_r_index];
        }
        console.log(stim_l_index);
        console.log(stim_r_index);
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
            html = "<p class='center_point'>時間切れです。<br>";
            html += "4秒以内に選択してください。</p>";
        };
        return html;
    },
    choices: "NO_KEYS",
    trial_duration: durLightSelected,
    on_finish: function() {
        // update the number of exposure
        if (chosenStim != null) {
            if (condArray[block-1] == 0) {// low reward
                numExposeLow[stim_l_index] += 1;
                numExposeLow[stim_r_index] += 1;
            } 
            else if (condArray[block-1] == 1) {// high reward
                numExposeHigh[stim_l_index] += 1;
                numExposeHigh[stim_r_index] += 1;
            };
        };
    }
};

// get coin or no coin
const get_coin = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus:function() {
        let html;
        // calculate reward probability
        if (pressedKey == null) {// no response
            html = "<p class='center_point'>時間切れです。<br>";
            html += "4秒以内に選択してください。</p>";
            isCoin = 0;
        } else {
            if (condArray[block-1] == 0) {// low condition
                if (pressedKey == "f") {
                    stimIdxInBlockArrayLow[blockCond-1].filter((value, index) => {
                        if (value == stim_l_index) {
                            chosenStimIdx = index;
                        } else if (value == stim_r_index) {
                            unchosenStimIdx = index;
                        };
                    });
                } 
                else if (pressedKey == "j") {
                    stimIdxInBlockArrayLow[blockCond-1].filter((value, index) => {
                        if (value == stim_r_index) {
                            chosenStimIdx = index;
                        } else if (value == stim_l_index) {
                            unchosenStimIdx = index;
                        };
                    });
                };
                rProbSelected = rProbInBlockArrayLow[blockCond-1][chosenStimIdx];
            }
            else if (condArray[block-1] == 1) {// high condition
                if (pressedKey == "f") {
                    stimIdxInBlockArrayHigh[blockCond-1].filter((value, index) => {
                        if (value == stim_l_index) {
                            chosenStimIdx = index;
                        } else if (value == stim_r_index) {
                            unchosenStimIdx = index;
                        };
                    });
                } 
                else if (pressedKey == "j") {
                    stimIdxInBlockArrayHigh[blockCond-1].filter((value, index) => {
                        if (value == stim_r_index) {
                            chosenStimIdx = index;
                        } else if (value == stim_l_index) {
                            unchosenStimIdx = index;
                        };
                    });
                };
                rProbSelected = rProbInBlockArrayHigh[blockCond-1][chosenStimIdx];
            };
            
            // present coin or not
            console.log(rProbSelected);
            if (Math.random() < rProbSelected) {// get coin
                isCoin = 1;
                html = "<p class='center'><img src='slots_and_coin/COIN.png'></p>";
                html += "<p class='center_upper'><b>コインを獲得しました！</b><br><br>ボーナススロットを回せます。</p>"
                if (condArray[block-1] == 0) {
                    numWinLow[chosenStim] += 1;
                } else {
                    numWinHigh[chosenStim] += 1;
                }
            } else { // no coin
                isCoin = 0;
                html = "<p class='center'><img src='slots_and_coin/no_coin.png'></p>";
                html += "<p class='center_upper'>残念…コインを得られませんでした。</p>"
                if (condArray[block-1] == 0) {
                    numLossLow[chosenStim] += 1;
                } else {
                    numLossHigh[chosenStim] += 1;
                }
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
            html = "<p class='center_point'>+</p>";
        } else {// present bonus slot machine
            if (condArray[block-1] == 0) {// low reward
                html = "<p class='center'><img src='slots_and_coin/low_slot.png'></p>";
            } else {// high reward
                html = "<p class='center'><img src='slots_and_coin/high_slot.png'></p>";
            };
            html += "<p class='slot_inst'>スペースキーを押して<br>スロットを回してください。</p>"
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
            html = "<p class='center_point'>+</p>";
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
            td = runif(800, 1200);
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
            html = "<p class='center_point'>+</p>";
        } else {
            if (condArray[block-1] == 0) {// low reward
                reward = Math.round(rnorm(smallMean, smallSD, 1));
                pointInBlock += reward;
            } else { // high reward
                reward = Math.round(rnorm(largeMean, largeSD, 1));
                pointInBlock += reward;
            };
            html = `<p class='center_point'><b>${reward}円</b><br>獲得しました！</p>`;
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
    },
    on_finish: function(data) {
        data.timing = "outcome";
        data.isCoin = isCoin;
        data.reward = reward;
        data.pointInBlock = pointInBlock;
    }
};

// text to present between the blocks
const text_after_block = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let restTime;
        let text = `<p class='inst_text'>${numBlocks}個中${block}個目のカジノでの試行が終了しました。<br><br>`;
        if (block == 15) {
            restTime = 5;
            text += "前半が終了しました。お疲れさまでした。<br>"
            if (condArray[0] == 0) {// if the experiment starts with low reward block
                text += "次のカジノからは，<b>【豪華なボーナススロット】</b>が用意されています。<br>";
            } else {
                text += "次のカジノからは，<b>【普通のボーナススロット】</b>が用意されています。<br>";
            };
            text += "<b>後半では用いられるすべての絵画が前半とは異なります</b>ので，注意してください。<br><br>";
        } else {
            restTime = 1;
        };

        if (block == 30) {// finish
            text += "お疲れさまでした。<br>スペースキーを押して次の画面へ進んでください。</p>";
        } else {
            text += `必要な場合${restTime}分以内の休憩を取ってください。<br>`;
            text += "準備ができたらスペースキーを押して，<br>次のカジノへ移動してください。<br><br>";
            text += "おなじ絵画でも，<b>コインを獲得できる確率はこれまでのカジノとは独立である</b><br>ことに注意してください。</p>";
        };
        return text;
    },
    choices: [" "]
};

// timeline for one block
const one_block = {
    timeline: [
        ITI,
        show_and_select,
        highlight,
        get_coin,
        present_bonus_slot,
        spin_bonus_slot,
        show_outcome
    ],
    loop_function: function() {
        if (trialInBlock < numTrialInBlock) {
            trialInBlock += 1;
            return true;
        } else {
            return false;
        }
    }
};

// timeline for whole blocks
const all_blocks = {
    timeline: [
        one_block,
        text_after_block
    ],
    loop_function: function() {
        if (block < numBlocks) {
            block += 1;
            if (block == 15) {
                blockCond = 1; // reset
            } else {
                blockCond += 1;
            };
            // reset
            trialInBlock = 1;
            pointInBlock = 0;
            numWinLow = Array(numCondStim).fill(0); // number of times win is observed (reset at each block)
            numLossLow = Array(numCondStim).fill(0); // number of times loss is observed (reset at each block)
            numWinHigh = Array(numCondStim).fill(0); // number of times win is observed (reset at each block)
            numLosshigh = Array(numCondStim).fill(0); // number of times loss is observed (reset at each block)
            return true;
        } else {
            return false;
        };
    }
};

const text_after_confirmation = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let text = `<p class='inst_text'>それでは，本番を開始してください。<br>`;
        if (condArray[0] == 0) {
            text += "前半の15個のカジノのボーナススロットは，<b>【普通のスロット】</b>です。<br>";
        } else {
            text += "前半の15個のカジノのボーナススロットは，<b>【豪華なスロット】</b>です。<br>";
        };
        text += "スペースキーを押すと始まります。<br>";
        return text;
    },
    choices: [" "]
};


// =========== Memory test ===========
let memoryTrial = 1
let memoryTrialH = 1;
let memoryTrialL = 1;
let memoryTrialU = 1;
let memoryTrialNum = numMemoryStim*2; // 60 
let memoryStimIdxH = [];
let memoryStimIdxL = [];
let memoryStimH = Array(numMemoryStim/2).fill("");
let memoryStimL = Array(numMemoryStim/2).fill("");
let memoryStimU = []; // unpresented stimuli
// array representing the type of stimuli; 0: high, 1: low, 2: unpresented
let stimType = Array(numMemoryStim/2).fill(0).concat(Array(numMemoryStim/2).fill(1), Array(numMemoryStim).fill(2));
stimType = jsPsych.randomization.shuffle(stimType);
let YorN;
let correct;

// trial for memory test
const memory_trial = {
    on_start: function() {
        if (memoryTrial == 1) {
            // find familiar stimuli
            numExposeHigh.filter((value, index) =>  {
                if (value > 3) {
                    memoryStimIdxH.push(index)
                };
            });

            numExposeLow.filter((value, index) =>  {
                if (value > 3) {
                    memoryStimIdxL.push(index)
                };
            });

            // select 15 stimuli randomly
            memoryStimIdxH = jsPsych.randomization.sampleWithoutReplacement(memoryStimIdxH, numMemoryStim/2);
            memoryStimIdxL = jsPsych.randomization.sampleWithoutReplacement(memoryStimIdxL, numMemoryStim/2);
            for (let k=0; k<numMemoryStim/2; k++) {
                memoryStimH[k] = main_stim_h[memoryStimIdxH[k]];
                memoryStimL[k] = main_stim_l[memoryStimIdxL[k]];
            };
            memoryStimU = jsPsych.randomization.sampleWithoutReplacement(test_stim, numMemoryStim);
        }
    },
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let html;
        if (stimType[memoryTrial-1] == 0) {// high reward stimulus
            html = `<p class='center'><img src=${memoryStimH[memoryTrialH-1]}></p>`;
            memoryTrialH += 1;
        }
        else if (stimType[memoryTrial-1] == 0) {// low reward stimulus
            html = `<p class='center'><img src=${memoryStimL[memoryTrialL-1]}></p>`;
            memoryTrialL += 1;
        }
        else {// unused stimulus
            html = `<p class='center'><img src=${memoryStimU[memoryTrialU-1]}></p>`;
            memoryTrialU += 1;
        };
        html += "<p class='center_lower'>この絵画をいずれかのカジノで見ましたか？<br>";
        html += "はい: Y   いいえ: N</p>";
        return html;
    },
    choices: ["Y", "N"],
    on_finish: function(data) {
        YorN = jsPsych.data.get().last(1).values()[0].response;
        if (stimType[memoryTrial-1] == 2) {// if unused stimulus is presented
            if (YorN == "N") {
                correct = 1;
            } else {
                correct = 0;
            };
        } else {// if used stimulus is presented
            if (YorN == "Y") {
                correct = 1;
            } else {
                correct = 0;
            };
        };
        // record
        data.timing = "memoryTest";
        data.memoryStimType = stimType[memoryTrial-1];
        data.memoryCorrect = correct;
        memoryTrial += 1;
    }
};

const memory_ITI = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: "<p class='center_point'>+</p>",
    choices: "NO_KEYS",
    trial_duration: runif(500, 1000)
};

// timeline for memory test
const memory_block = {
    timeline: [
        memory_ITI,
        memory_trial
    ],
    loop_function: function() {
        if (memoryTrial < memoryTrialNum) {
            return true;
        } else {
            return false;
        };
    }
};

const end_exp = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
        let text;
        text = "<p class='inst_text'>これで実験は終了です。大変お疲れさまでした。<br>";
        text += `冒頭でお伝えしたように，あなたのIDは"${participantID}"です。<br>`;
        text += "このIDとともに，実験が終了したことを伝えるメールを下村まで送ってください。<br>";
        text += "では最後にスペースキーを押して，<b>画面が完全に真っ暗になったのを必ず確認して</b>から，";
        text += "画面を閉じてください。<br>";
        text += "見えにくいですが，灰色のローディングマークが中央で回っている間はデータ転送中ですので，";
        text += "画面を消さないように注意してください。<br>";
        text += "通常は30秒ほどでデータ転送が完了します。</p>";
        return text;
    },
    choices: [" "]
};

// timeline to save data using pipeline
const save_data = {
    type: jsPsychPipe,
    action: "save",
    experiment_id: "kyCllKryCOAj",
    filename: function() {
        filename = `${participantID}.csv`;
        return(filename);
    },
    data_string: () => jsPsych.data.get().csv()
};

// timeline for full experiment
const full_exp = {
    timeline: [
        preload,
        preload2,
        preload3,
        start_FS,
        informedConsent,
        inform_ID,
        som_block,
        cesd_block,
        first_inst,
        prac_block,
        inst_after_prac,
        confirmation_repeat,
        text_after_confirmation,
        all_blocks,
        inst_memory,
        memory_block,
        end_exp
    ]
};

const timeline = [full_exp];

// start the experiment
jsPsych.run(timeline);