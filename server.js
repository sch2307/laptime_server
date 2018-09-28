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

// Initialize User variable
var car_id = 0, laser_cnt = -1, cp_cnt = 0;
var timer_thread, minutes = 0, seconds = 0;
var next_device_num = 0;

// JSON Data to display on the web
var user_data_array = new Array();

// Console DEBUG
var Console_DEBUG = true;

// Stopwatch 
function startTimer() {
	timer_thread = setInterval(function() {
		seconds = seconds + 1; //seconds++;
		if (seconds >= 60) {
			seconds = 0;
			minutes = minutes + 1; //minutes++;
		}
	}, 1000);
}

function clearTimer() {
	clearInterval(timer_thread);
}

function getTime() {
	if (minutes >= 10 && seconds >= 10) {
		return minutes + ':' + seconds;
	} else if (minutes >= 10 && seconds < 10) {
		return minutes + ':' + seconds + '0';
	} else if (minutes < 10 && seconds >= 10) {
		return '0' + minutes + ':' + seconds;
	} else if (minutes < 10 && seconds < 10) {
		return '0' + minutes + ':0' + seconds;
	}
}

function checkCurrentDevice(currentDeviceNum, checkDevice) {
	if (currentDeviceNum == checkDevice) {
		return true;
	} else {
		return false;
	}
}

function checkNextDevice(currentDeviceNum, nextDeviceNum) {
	if (currentDeviceNum == nextDeviceNum) {
		return true;
	} else {
		return false;
	}
}

function checkRoundCnt() {
	if (laser_cnt == -1) { //Initialize Stopwatch
		startTimer(); 
		laser_cnt++;
	} else if (laser_cnt >= 0 && laser_cnt < 3) { //Reset cp_cnt
		cp_cnt = 0;
		laser_cnt++;
	} else { //Successful Vehicle Track Driving
		cp_cnt = 0;
		laser_cnt = -1;
		clearTimer();
	}
}

function resetUserDataArr() {
	user_data_array.splice(0, user_data_array.length);
}

function startDataloading() {
	// SYNC Webpage(main.html) - Convert of JSON type
	inrt_sql = 'SELECT * FROM kesl_raspberry';
	connection.query(inrt_sql, (error, rows, fields) => {
		if(!error) {
			var participantInfo;
			for (var i = 0; i < rows.length; i++) {
				participantInfo = new Object();
				participantInfo.car_id = rows[i].car_id;
				participantInfo.university_name = rows[i].university_name;
				participantInfo.team_name = rows[i].team_name;
				participantInfo.cp_cnt = rows[i].cp_cnt;
				
				/* CHECK POINT 1-3 */
				participantInfo.check_point_1 = rows[i].check_point_1;
				participantInfo.check_point_2 = rows[i].check_point_2;
				participantInfo.check_point_3 = rows[i].check_point_3;

				/* CHECK POINT 4-6 */
				participantInfo.check_point_4 = rows[i].check_point_4;
				participantInfo.check_point_5 = rows[i].check_point_5;
				participantInfo.check_point_6 = rows[i].check_point_6;

				/* CHECK POINT 7-9 */
				participantInfo.check_point_7 = rows[i].check_point_7;
				participantInfo.check_point_8 = rows[i].check_point_8;
				participantInfo.check_point_9 = rows[i].check_point_9;

				/* CHECK POINT 10-12 */
				participantInfo.check_point_10 = rows[i].check_point_10;
				participantInfo.check_point_11 = rows[i].check_point_11;
				participantInfo.check_point_12 = rows[i].check_point_12;

				/* CHECK POINT 13-15 */
				participantInfo.check_point_13 = rows[i].check_point_13;
				participantInfo.check_point_14 = rows[i].check_point_14;
				participantInfo.check_point_15 = rows[i].check_point_15;
				user_data_array.push(participantInfo);
			}
		} else {
			if (Console_DEBUG) {
				console.log(error);
			}
		}
	});
}

app.get('/get_json_data', (req, res) => {
	if (user_data_array.length == 0) {
		startDataloading();
	}
	res.send(JSON.stringify(user_data_array));
});

app.post('/data_add', (req, res) => {
	challenge_data = req.body;

    inrt_sql = "INSERT INTO kesl_raspberry (`car_id`, `university_name`, `team_name`, `cp_cnt`, `check_point_1`, `check_point_2`, `check_point_3`, `check_point_4`, `check_point_5`, `check_point_6`, `check_point_7`, `check_point_8`, `check_point_9`, `check_point_10`, `check_point_11`, `check_point_12`, `check_point_13`, `check_point_14`, `check_point_15`) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    params = [challenge_data.car_id, challenge_data.school, challenge_data.team, -1, '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    connection.query(inrt_sql, params, (error, rows, fields) => {
		if(!error) {
			if (Console_DEBUG) {
				console.log(rows.insertId);
			}
		} else {
			if (Console_DEBUG) {
				console.log(error);
			}
		}
	});
    res.send();
});

app.post('/setCarId', (req, res) =>  {
	challenge_data = req.body;
	car_id = challenge_data.car_id;
	if (Console_DEBUG) {
		console.log("[DEBUG] CAR_ID : " + car_id);
	}
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
				console.log(car_id + "PRIVATE KEY - DELETE SUCCESSFUL");
			}
		} else {
			if (Console_DEBUG) {
				console.log(error);
			}
		}
	});

	// Reset user_data_array
	resetUserDataArr();

    res.send();
});


app.post('/data', (req, res) => {
	if (Console_DEBUG) {
		console.log('CLIENT-SIDE DATA RECEIVED');
	}
	res.writeHead(200, {"Content-Type": "application/json"});
	
	var jsonObj = req.body;
	var device_id = jsonObj.device_id;
	var status = jsonObj.status;

	if (Console_DEBUG) {
		console.log("LASER_COUNT : " + laser_cnt);
	}

	if (checkCurrentDevice(device_id, 0) && checkNextDevice(device_id, next_device_num)) {
		checkRoundCnt();
	}

	if (status == 0) { //status 0 is UPDATE
		if (Console_DEBUG) {
			console.log("STATUS : " + status);
			console.log("CURRENT DEVICE ID : " + device_id);
			console.log("NEXT DEVICE ID : " + next_device_num);
			console.log("-------------------------------------");
		}
		if (checkNextDevice(device_id, next_device_num)) { //Check current device number
			if (Console_DEBUG) {
				console.log("START TIME_TABLE UPDATE");
			}

			// Count cp_cnt
			cp_cnt++;

			// RESET user_data_array
			resetUserDataArr();

			// UPDATE TIME_TABLE
			inrt_sql = 'UPDATE kesl_raspberry SET `cp_cnt` = ?, `check_point_'+ (cp_cnt) +'` = ? WHERE `car_id` = ' + car_id;
			params = [cp_cnt, getTime()];
			connection.query(inrt_sql, params, (error, rows, fields) => {
				if(!error) {
					if (Console_DEBUG) {
						console.log(rows.insertId);
					}
				} else {
					if (Console_DEBUG) {
						console.log(error);
					}
				}
			});
			// Reset kesl_raspberry Data
			startDataloading();

			// Ignore all devices that I will not see next.
			next_device_num = device_id + 1;
			if (next_device_num > 15) {
				next_device_num = 0;
			}
		}
		res.send();
	}
});

app.use((error, res, next) => {next(createError(404))});

app.set('port', process.env.PORT || 52275);
app.listen(app.get('port'), () => {console.log('NODE EXPRESS SERVER listening on port ' + app.get('port'));});
