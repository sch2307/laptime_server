// Extract Modules
var http = require('http');
var express = require('express');
var mysql = require('mysql');
var createError = require('http-errors')

// Connect to the databases
var dbconfig = require('./config/db.js');
var connection = mysql.createConnection(dbconfig);

var app = express();

const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(express.static('public'));

/* 유저 변수 초기화 */
var car_id = 0, round_cnt = 0, ultra_dec_vals = 0;
var linear_out_of_line = 0, nlinear_out_of_line = 0;
var isStart = false, isDetection = false, score = 0;

var lap_timer_thread, lap_minutes = 0, lap_seconds = 0;
var linear_out_timer_thread, linear_out_seconds = 0;

var isComplete = false;

/* 웹에 표시할 데이터 집합 어레이 */
var user_data_array = new Array();

/* 콘솔에 디버그 메세지 출력 */
var Console_DEBUG = true;

/**
 * 직선 코스에서 차량이 라인을 벗어나는 시점에서 타이머를 시작하는 함수
 **/
function startLinearOutTimer() {
    linear_out_timer_thread = setInterval(function () {
        linear_out_seconds += 1000;
    }, 1000);
}

/**
 * 직선 코스에서 차량이 라인에서 들어오는 시점에서 타이머를 종료하는 함수
 **/
function clearLinearOutTimer() {
    clearInterval(linear_out_timer_thread);
}

/**
 * 직선 코스 초를 측정한 변수를 반환하는 함수
 **/
function getLinearOutVals() {
    return linear_out_seconds;
}

/**
 * 직선 코스 초를 측정한 변수를 초기화하는 함수
 **/
function clearLinearOutVals() {
    linear_out_seconds = 0;
}

/**
 * 차량 주행 시간을 기록하기 위한 타이머를 설정하기 위한 함수
 **/
function startLapTimer() {
	lap_timer_thread = setInterval(function() {
		lap_seconds++;
		if (lap_seconds >= 60) {
			lap_seconds = 0;
            lap_minutes++;
		}
	}, 1000);
}

/**
 * 차량 주행 시간을 기록하기 위한 타이머를 초기화하기 위한 함수
 **/
function clearLapTimer() {
	lap_minutes = 0; lap_seconds = 0;
	clearInterval(lap_timer_thread);
}

/**
 * 데이터베이스에 저장하기 위한 시간을 반환하는 함수
 **/
function getTime() {
    if (lap_minutes >= 10 && lap_seconds >= 10) {
        return lap_minutes + ':' + lap_seconds;
    } else if (lap_minutes >= 10 && lap_seconds < 10) {
		return lap_minutes + ':' + lap_seconds + '0';
	} else if (lap_minutes < 10 && lap_seconds >= 10) {
		return '0' + lap_minutes + ':' + lap_seconds;
	} else if (lap_minutes < 10 && lap_seconds < 10) {
		return '0' + lap_minutes + ':0' + lap_seconds;
	}
}

/**
  * ultra_dec_vals 값을 uVals 만큼 가산하는 함수
  **/
function additionUltradec(uVals) {
    ultra_dec_vals += uVals;
}

/**
  * ultra_dec_vals 값을 초기화하는 함수
  **/
function resetUltraDec() {
    ultra_dec_vals = 3;
}

/**
  * 현재 데이터를 DB에서 가져와서 JSON타입으로 변환할 수 있도록 Array 에 저장하기 위해 존재하는 함수
  **/
function loadingDataBases() {
	inrt_sql = 'SELECT * FROM kesl_raspberry';
	connection.query(inrt_sql, (error, rows, fields) => {
		if(!error) {
			var participantInfo;
			for (var i = 0; i < rows.length; i++) {
				participantInfo = new Object();
				participantInfo.car_id = rows[i].car_id;
				participantInfo.university_name = rows[i].university_name;
                participantInfo.team_name = rows[i].team_name;
                participantInfo.score = rows[i].score;

				participantInfo.linear_out_of_line = rows[i].linear_out_of_line;
				participantInfo.nlinear_out_of_line = rows[i].nlinear_out_of_line;
				
				/* CHECK POINT 1-3 */
				participantInfo.check_point_1 = rows[i].check_point_1;
				participantInfo.check_point_2 = rows[i].check_point_2;
				participantInfo.check_point_3 = rows[i].check_point_3;

				user_data_array.push(participantInfo);
			}
		} else {
			if (Console_DEBUG) {
				console.log(error);
			}
		}
	});
}

/**
 * 현재 user_data_array 에 존재하는 데이터를 모두 삭제하기 위해 존재하는 함수
 **/
function resetUserDataArr() {
    user_data_array.splice(0, user_data_array.length);
}

/**
 * 현재 데이터를 웹 페이지와 동기화하기 위해서 최신 데이터를 Array 에 저장하는 함수
 **/
function syncDatabases() {
	try {
		resetUserDataArr();
	} finally {
		loadingDataBases();
	}
}

/**
 * 차량이 새롭게 주행할 때, 관련 변수를 초기화하기 위해 존재하는 함수
 **/
function Initialize(letStart) {
    if (letStart === true) {
        /* 현재 차량이 트랙을 주행한 횟수를 초기화 합니다 */
        round_cnt = 1;

        /* 다음 감지해야 할 장치번호를 초기화 합니다 */
        resetUltraDec();

        /* 현재 팀의 점수 현황을 초기화 합니다 */
        score = 0;

        /* 현재 팀의 곡선 이탈 횟수를 초기화 합니다 */
        nlinear_out_of_line = 0;

        /* 현재 팀의 직선 이탈 횟수를 초기화 합니다 */
        linear_out_of_line = 0;

        /* 라운드 완주 상태를 초기화 합니다 */
        isComplete = false;

        /* 차량 상태를 '주행'으로 변경합니다 */
        isStart = true;

        /* 타이머를 초기화 합니다 */
        clearLapTimer();
    
        /* 타이머를 재시작 합니다 */
        startLapTimer();
    } else {
        /* 타이머만 초기화 합니다 */
        clearLapTimer();
    }
}

/**
 * 현재 스코어에서 scVals 만큼 더하기 위해 존재하는 함수
 **/
function additionScore(scVals) {
    score += scVals;
}

/**
 * 현재 스코어에서 scVals 만큼 차감하기 위해 존재하는 함수
 **/
function subScore(scVals) {
    score -= scVals;
}

/**
 * 현재 스코어를 데이터베이스로 업데이트하기 위해 존재하는 함수
 **/
function updateScore_DB() {
    inrt_sql = 'UPDATE kesl_raspberry SET `score` = ? WHERE `car_id` = ' + car_id;
    params = [score];
    connection.query(inrt_sql, params, (error, rows, fields) => {
        if (!error) {
            if (Console_DEBUG) {
                console.log(rows.insertId);
            }
        } else {
            if (Console_DEBUG) {
                console.log(error);
            }
        }
    });
}

/**
 * 현재 트랙 주행 횟수를 반환하기 위해 존재하는 함수
 **/
function getRoundCount() {
    return round_cnt > 3 ? 3 : round_cnt;
}

/**
 * 현재 트랙 주행 횟수를 rVals 만큼 더하기 위해 존재하는 함수
 **/
function additionRound(rVals) {
    round_cnt += rVals;
}

/**
 * 함수를 호출한 시간을 데이터베이스에 업데이트하기 위해 존재하는 함수
 **/
function updateTimeTable() {
    inrt_sql = 'UPDATE kesl_raspberry SET `check_point_' + (getRoundCount()) + '` = ? WHERE `car_id` = ' + car_id;
    params = [getTime()];
    connection.query(inrt_sql, params, (error, rows, fields) => {
        if (!error) {
            if (Console_DEBUG) {
                console.log(rows.insertId);
            }
        } else {
            if (Console_DEBUG) {
                console.log(error);
            }
        }
    });
}

/**
 * 현재 직선 구간 이탈 횟수를 반환하기 위해 존재하는 함수
 **/
function getLinearOutline() {
    return linear_out_of_line;
}

/**
 * 현재 직선 구간 이탈 횟수를 lVars 만큼 더하기 위해 존재하는 함수
 **/
function additionLinearOutline(lVals) {
    linear_out_of_line += lVals;
}

/**
 * 직선 구간의 이탈 횟수를 데이터베이스로 업데이트 하기 위한 함수
 **/
function updateLinearOutline_DB() {
        inrt_sql = 'UPDATE kesl_raspberry SET `linear_out_of_line` = ? WHERE `car_id` = ' + car_id;
        params = [getLinearOutline()];
        connection.query(inrt_sql, params, (error, rows, fields) => {
            if (!error) {
                if (Console_DEBUG) {
                    console.log(rows.insertId);
                }
            } else {
                if (Console_DEBUG) {
                    console.log(error);
                }
            }
        });
    }
}

/**
 * 현재 곡선 구간 이탈 횟수를 반환하기 위해 존재하는 함수
 **/
function getnLinearOutline() {
    return nlinear_out_of_line;
}

/**
 * 현재 곡선 구간 이탈 횟수를 nlVars 만큼 더하기 위해 존재하는 함수
 **/
function additionnLinearOutline(nlVals) {
    nlinear_out_of_line += nlVals;
}

/**
 * 곡선 구간의 이탈 횟수를 데이터베이스로 업데이트 하기 위한 함수
**/
function updatenLinearOutline_DB() {
        inrt_sql = 'UPDATE kesl_raspberry SET `nlinear_out_of_line` = ? WHERE `car_id` = ' + car_id;
        params = [getnLinearOutline()];
        connection.query(inrt_sql, params, (error, rows, fields) => {
            if (!error) {
                if (Console_DEBUG) {
                    console.log(rows.insertId);
                }
            } else {
                if (Console_DEBUG) {
                    console.log(error);
                }
            }
        });
}

app.get('/get_json_data', (req, res) => {
    if (user_data_array.length === 0) {
        syncDatabases();
    }
    res.send(JSON.stringify(user_data_array));
});

app.post('/starter_detect', (req, res) => {
    res.writeHead(200, { "Content-Type" : "application/json" });
    var jsonObj = req.body;
    var device_id = jsonObj.device_id;
    var status = jsonObj.status;

    if (isStart === false) { /* 차량 시작 상태가 아닌 경우 */
        Initialize(true);
    } else { /* 이미 시작한 상태 */
        if (isComplete === true) { /* 트랙 주행을 완료한 상태인 경우 */
            if (round_cnt >= 1 && round_cnt <= 3) { /* 트랙 주행 횟수가 1 ~ 3회 이하 */
                updateTimeTable();
                additionRound(1);
                resetUltraDec();
            } else if (round_cnt > 3) {/* 트랙 주행 횟수가 3회를 초과할 경우 */
                if (status === 1) { /* status 1 : 정지 지점에 3초 간 정지를 성공 */
                    additionScore(10);
                } else { /* status 0 : 정지 지점에 3초 간 정지를 실패 */
                    subScore(10);
                }
                /* 차량 주행 완료 */
                Initialize(false);
            }
            isComplete = false;
        }
        /* 트랙 주행시 마다, 점수 현황 업데이트 */
        updateScore_DB();
    }
    syncDatabases();
    res.send();
});

app.post('/outline_detect', (req, res) => {
    res.writeHead(200, { "Content-Type" : "application/json" });

    var jsonObj = req.body;
    var device_id = jsonObj.device_id;
    var status = jsonObj.status;

    if (status === 1) { /* status 1 : 곡선 이탈 횟수 업데이트 */
        console.log("is ULTRA DETECT : " + device_id);
        console.log("is NEXT LASER DETECT : " + ultra_dec_vals);
        try {
            if (Console_DEBUG) {
                console.log("DEVICE_ID : " + device_id);
                console.log("STATUS : " + status);
                console.log("ULTRA_DEC_VALS : " + ultra_dec_vals);
            }
            additionnLinearOutline(1);
            updatenLinearOutline_DB();
        } finally {
            additionUltradec(1);
        }
    } else if (status === 2) { /* status 2 : 직선 이탈 횟수 업데이트 - 타이머 시작 */
        if (Console_DEBUG) {
            console.log("DEVICE_ID : " + device_id);
            console.log("STATUS : " + status);
            console.log("LINEAR_OUT_OF_LINE DETECTION");

            additionLinearOutline(1);
            updateLinearOutline_DB();
        }
        //    if (isDetection == false) {
        //        if (Console_DEBUG) {
        //            console.log("DEVICE_ID : " + device_id);
        //            console.log("STATUS : " + status);
        //            console.log("LINEAR_OUT_OF_LINE TIMER START");
        //        }
        //        startLinearOutTimer();
        //    } else {
        //        try {
        //            if (Console_DEBUG) {
        //                console.log("DEVICE_ID : " + device_id);
        //                console.log("STATUS : " + status);
        //                console.log("LINEAR_OUT_OF_LINE TIMER START");
        //            }
        //            clearLinearOutTimer();
        //        } finally {
        //            /* 라인을 물면서 운행한 시간을 반환 */
        //            getLinearOutVals();

        //            /* 직선 이탈 횟수 데이터베이스 업데이트 */
        //            additionLinearOutline(1);
        //            updateLinearOutline_DB();

        //            /* 라인을 물면서 운행한 시간 삭제 */
        //            clearLinearOutVals();
        //       }
        // }
    } else if (status === 3) { /* 마지막 체크 포인트 주행 완료 */
        if (isComplete === false) {
            isComplete = true;
        }
    }
    syncDatabases();
    res.send();
 });

app.post('/data_add', (req, res) => {
    challenge_data = req.body;
    inrt_sql = "INSERT INTO kesl_raspberry (`car_id`, `university_name`, `team_name`, `score`, `linear_out_of_line`, `nlinear_out_of_line`, `check_point_1`, `check_point_2`, `check_point_3`) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)";
    params = [challenge_data.car_id, challenge_data.school, challenge_data.team, 0, 0, 0, '', '', ''];
    
    /* <2018/10/26> 데이터를 추가할 때, car_id 가 지정 되도록 수정 */
    car_id = challenge_data.car_id;
    console.log(car_id);

    connection.query(inrt_sql, params, (error, rows, fields) => {
        if (!error) {
            if (Console_DEBUG) {
                console.log(rows.insertId);
            }
        } else {
            if (Console_DEBUG) {
                console.log(error);
            }
        }
    });
    syncDatabases();
    res.send();
});

app.post('/data_delete', (req, res) => {
    challenge_data = req.body;
    car_id = challenge_data.car_id;
	inrt_sql = "DELETE FROM kesl_raspberry WHERE `car_id` = ?";
	params = [car_id];
    connection.query(inrt_sql, params, (error, rows, fields) => {
		if (!error) {
			if (Console_DEBUG) {
				console.log(car_id + " >> PRIVATE KEY - DELETE SUCCESSFUL");
			}
		} else {
			if (Console_DEBUG) {
				console.log(error);
			}
		}
    });
    syncDatabases();
    res.send();
});

app.use((error, res, next) => {next(createError(404))});

app.set('port', process.env.PORT || 52275);
app.listen(app.get('port'), () => {console.log('NODE EXPRESS SERVER listening on port ' + app.get('port'));});
