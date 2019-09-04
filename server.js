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
app.use(bodyParser.urlencoded({
  extended: false
}));
app.use(bodyParser.json());
app.use(express.static('public'));

/* 직선 이탈 감지코드 최적화 - 2019.09.03 */
/* 미사용 곡선 코드 제거 - 2019.09.03 */
var linear_out_of_line = 0;

/** 차량상태 변수 통합 - 2019.09.03
 * carStatus 1 - 대기(아이들링)
 * carStatus 2 - 주행중
 * carStatus 3 - 주행완료
 **/
var vehicleID = 0, roundCount = 0, scoreSum = 0;
var isCarStatus = 0, isLinearTimerStart = false;

var lap_timer_thread, lap_minutes = 0,lap_seconds = 0;
var linear_out_timer_thread, linear_out_seconds = 0;

/* 웹에 표시할 데이터 집합 어레이 */
var user_data_array = [];

/* 콘솔에 디버그 메세지 출력 */
var Console_DEBUG = true;

/**
 * 직선 코스에서 차량이 라인을 벗어나는 시점에서 타이머를 시작하는 함수
 * 2019.09.03 Bug Fix
 **/
function startLinearOutTimer() {
  try {
    linear_out_timer_thread = setInterval(function() {
      linear_out_seconds += 1000;
    }, 1000);
  } finally {
    setLinearTimerStatus(true);
  }
}

/**
 * 직선 코스에서 차량이 라인에서 들어오는 시점에서 타이머를 종료하는 함수
 * 2019.09.03 Bug Fix
 **/
function clearLinearOutTimer() {
  try {
    clearInterval(linear_out_timer_thread);
  } finally {
    setLinearTimerStatus(false);
  }
}

/**
 * 직선 구간 타이머 시작여부 변수를 반환하는 함수(getter)
 * 2019.09.04 
 **/
function getLinearTimerStatus() {
  return isLinearTimerStart;
}

/**
 * 직선 구간 타이머 시작여부 변수를 변경하는 함수(setter)
 * 2019.09.04 
 **/
function setLinearTimerStatus(statusVals) {
  isLinearTimerStart = statusVals;
}

/**
 * 직선 코스 초를 측정한 변수를 반환하는 함수(getter)
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
 * 차량 주행상태 변수를 반환하는 함수(getter)
 * 2019.09.04 
 **/
function getCarStatus() {
  return isCarStatus;
}

/**
 * 차량 주행상태 변수를 변경하는 함수(setter)
 * 2019.09.04
 **/
function setCarStatus(statusVals) {
  isCarStatus = statusVals;
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
  lap_minutes = 0;
  lap_seconds = 0;
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
 * 현재 데이터를 DB에서 가져와서 JSON타입으로 변환할 수 있도록 Array 에 저장하기 위해 존재하는 함수
 **/
function loadingDataBases() {
  inrt_sql = 'SELECT * FROM kesl_raspberry';
  connection.query(inrt_sql, (error, rows, fields) => {
    if (!error) {
      var participantInfo;
      for (var i = 0; i < rows.length; i++) {
        participantInfo = {};
        participantInfo.vehicleID = rows[i].vehicleID;
        participantInfo.university_name = rows[i].university_name;
        participantInfo.team_name = rows[i].team_name;
        participantInfo.scoreSum = rows[i].scoreSum;

        participantInfo.linear_out_of_line = rows[i].linear_out_of_line;

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
function initialize() {
  /* 현재 차량이 트랙을 주행한 횟수를 초기화 합니다 */
  roundCount = 1;

  /* 현재 팀의 점수 현황을 초기화 합니다 */
  scoreSum = 0;

  /* 현재 팀의 직선 이탈 횟수를 초기화 합니다 */
  linear_out_of_line = 0;

  /* 차량 상태를 '주행'으로 변경합니다 */
  setCarStatus(1);

  /* 타이머를 초기화 합니다 */
  clearLapTimer();

  /* 타이머를 재시작 합니다 */
  startLapTimer();
}

/**
 * 현재 스코어에서 scVals 만큼 더하기 위해 존재하는 함수
 **/
function additionScore(scVals) {
  scoreSum += scVals;
}

/**
 * 현재 스코어에서 scVals 만큼 차감하기 위해 존재하는 함수
 **/
function subScore(scVals) {
  scoreSum -= scVals;
}

/**
 * 현재 스코어를 데이터베이스로 업데이트하기 위해 존재하는 함수
 **/
function updateScore_DB() {
  inrt_sql = 'UPDATE kesl_raspberry SET `scoreSum` = ? WHERE `vehicleID` = ' + vehicleID;
  params = [scoreSum];
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
 * 2019.09.03 Bug Fix
 **/
function getRoundCount() {
  return roundCount;
}

/**
 * 현재 트랙 주행 횟수를 rVals 만큼 더하기 위해 존재하는 함수
 **/
function additionRound(rVals) {
  roundCount += rVals;
}

/**
 * 함수를 호출한 시간을 데이터베이스에 업데이트하기 위해 존재하는 함수
 **/
function updateTimeTable() {
  inrt_sql = 'UPDATE kesl_raspberry SET `check_point_' + (getRoundCount()) + '` = ? WHERE `vehicleID` = ' + vehicleID;
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
  inrt_sql = 'UPDATE kesl_raspberry SET `linear_out_of_line` = ? WHERE `vehicleID` = ' + vehicleID;
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

app.get('/get_json_data', (req, res) => {
  if (user_data_array.length === 0) {
    syncDatabases();
  }
  res.send(JSON.stringify(user_data_array));
});

app.post('/select_vehicle', (req, res) => {
  vehicleData = req.body;
  vehicleID = vehicleData.selectID;
  if (Console_DEBUG) {
    console.log("Select " + vehicleID);
  }
});

app.post('/starter_detect', (req, res) => {
  res.writeHead(200, {
    "Content-Type": "application/json"
  });
  var jsonObj = req.body;
  var device_id = jsonObj.device_id;
  var status = jsonObj.status;

  if (getCarStatus() === 0) { /* 차량 아이들링 */
    initialize();
  } else { /* 이미 시작한 상태 */
    if (getCarStatus() === 3) { /* 트랙 주행을 완료한 상태 */
      
      if (roundCount >= 1 && roundCount <= 3) { /* 트랙 주행 횟수 1 ~ 3회 이하 */
        updateTimeTable();
        additionRound(1);
      } else if (roundCount > 3) { /* 트랙 주행 횟수가 3회를 초과할 경우 */
        if (status === 1) { /* status 1 : 정지 지점에 3초 간 정지를 성공 */
          additionScore(10);
        } else { /* status 0 : 정지 지점에 3초 간 정지를 실패 */
          subScore(10);
        }
        /* 차량 주행 완료 */
        clearLapTimer();
      }
      setCarStatus(0);
    }
    
    /* 트랙 주행시 마다, 점수 현황 업데이트 */
    updateScore_DB();
  }
  syncDatabases();
  res.send();
});

app.post('/outline_detect', (req, res) => {
  res.writeHead(200, {
    "Content-Type": "application/json"
  });

  var jsonObj = req.body;
  var device_id = jsonObj.device_id;
  var status = jsonObj.status;

  if (status === 1) { /* status 1 : 직선 이탈 횟수 업데이트 */
    if (getLinearTimerStatus() === false) {
      if (Console_DEBUG) {
        console.log("DEVICE_ID : " + device_id);
        console.log("STATUS : " + status);
        console.log("LINEAR_OUT_OF_LINE TIMER START");
      }
      startLinearOutTimer();
    } else {
      try {
        if (Console_DEBUG) {
          console.log("DEVICE_ID : " + device_id);
          console.log("STATUS : " + status);
          console.log("LINEAR_OUT_OF_LINE TIMER END");
        }
        clearLinearOutTimer();
      } finally {
        /* 직선 이탈 횟수 데이터베이스 업데이트 */
        additionLinearOutline(1);
        updateLinearOutline_DB();
        
        /* 시간에 따른 스코어 감점_TEST_190904 */
        subScore(getLinearOutVals * 0.2);

        /* 라인을 물면서 운행한 시간 삭제 */
        clearLinearOutVals();
      }
    }
  } else if (status === 3) { /* 마지막 체크 포인트 주행 완료 */
    if (getCarStatus() === 1) {
      /* 주행완료 상태 변경 */
      setCarStatus(2);
    }
  }
  syncDatabases();
  res.send();
});

app.post('/data_add', (req, res) => {
  challenge_data = req.body;
  inrt_sql = "INSERT INTO kesl_raspberry (`vehicleID`, `university_name`, `team_name`, `scoreSum`, `linear_out_of_line`, `check_point_1`, `check_point_2`, `check_point_3`) VALUES(?, ?, ?, ?, ?, ?, ?, ?)";
  params = [challenge_data.vehicleID, challenge_data.school, challenge_data.team, 0, 0, '', '', ''];

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
  vehicleID = challenge_data.vehicleID;
  inrt_sql = "DELETE FROM kesl_raspberry WHERE `vehicleID` = ?";
  params = [vehicleID];
  connection.query(inrt_sql, params, (error, rows, fields) => {
    if (!error) {
      if (Console_DEBUG) {
        console.log(vehicleID + " >> PRIVATE KEY - DELETE SUCCESSFUL");
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

app.use((error, res, next) => {
  next(createError(404))
});

app.set('port', process.env.PORT || 52275);
app.listen(app.get('port'), () => {
  console.log('NODE EXPRESS SERVER listening on port ' + app.get('port'));
});