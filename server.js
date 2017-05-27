var http = require("http");
var https = require("https");
var fs = require("fs");
var exec = require("child_process").exec;
var execFile = require("child_process").execFile;

var download = function(url, dest, cb) {
	var file = fs.createWriteStream(dest);
	var proto = https;
	if(!url.startsWith('https'))
		proto = http;
	
	var request = proto.get(url, function(response) {
		response.pipe(file);
		file.on('finish', function() {
			file.close(cb);  // close() is async, call cb after close completes.
		});
	}).on('error', function(err) { // Handle errors
		fs.unlink(dest); // Delete the file async. (But we don't check the result)
		if (cb)
			cb(err.message);
	});
};

var scoreMap = new Map();

function getLeaderboard(response) {
	//debugger;
	scoreMap.forEach(function(value, key) {
		response.write('Score for team "' + key + '": ' + value + '<br />');
	});
	response.end('</body></html>');
}

function scoreSolution(executablePath, solutionNumber, teamName, response, callback) {
	var solutionDirectory = "solution_test_data/" + solutionNumber + '/';
	var totalScore = 0;
	var totalTests = 5;
	for(var i = 3; i < totalTests; i++) {
		var arguments = fs.readFileSync(solutionDirectory + 'test-' + ("0" + i).slice(-2) + '.in').toString().split("\n");
		var expectedOutput = fs.readFileSync(solutionDirectory + 'test-' + ("0" + i).slice(-2) + '.ans').toString().split("\n");
		//debugger;
		console.log(executablePath);
		function executeProgram(arguments, expectedOutput, iteration) {
			child = execFile(executablePath, arguments, function(error, stdout, stderr) {
				console.log(stderr);
				console.log('-' + solutionNumber + '-' + iteration);
				console.log(stdout);
				var actualOutput = stdout.split('\n');
				var passed = 0;
				for(var n = 0; n < expectedOutput.length && n < actualOutput.length; n++) {
					if(actualOutput[n] == expectedOutput[n])
						passed++;
					else
						response.write('Expected output: "' + expectedOutput[n] + '", actual output: "' + actualOutput[n] + '"<br />');
				}
				totalScore += passed;
				response.write('[' + iteration + '] ' + passed + ' out of ' + expectedOutput.length + ' values are correct.<br />');
				
				if(iteration === totalTests - 1) {
					response.write('Total score for submission: ' + totalScore);
					scoreMap.set(teamName, totalScore);
					callback(totalScore);
				}
			});			
		}
		executeProgram(arguments, expectedOutput, i);
		setTimeout(function() {
			//debugger;
			if(child !== undefined)
				child.kill('SIGKILL'); //FIXME
			
			// if(i === totalTests - 1) {
				// response.write('Total score for submission: ' + totalScore);
				// callback(totalScore);
			// }
		}, 10 * 1000);	
	}	
}


//http://64.28.197.146:8081/results/team1
//request.url = '/results/team1'
//request.method = 'GET'
function getResults(request, response) {
	var team = /\/results\/(.+)/g.exec(request.url)[1];
	team = decodeURI(team);
		
	var solutionRootDir = 'teams/' + team;
	console.log('getResults: ' + solutionRootDir);
	function testSolution(solutionNumber, endFunc) {
		var solution = 'solution' + solutionNumber;
		var solutionDirectory = solutionRootDir + '/' + solution;
		var filename = (fs.existsSync(solutionDirectory) ? 
			fs.readdirSync(solutionDirectory).filter(function(file) {
				return !fs.lstatSync(solutionDirectory + '/' + file).isDirectory(); 
			}).sort().reverse()[0] 
			: undefined);
			
		//debugger;
		if(!filename || filename === undefined) {
			response.write('No file submitted for: ' + solution);
			if(endFunc) {
				endFunc();
			}
			return;
		}
		var ext_re = /(.+)(\.[^.]+)$/;
		//var base = ext_re.exec(filename)[1];
		console.log(solution + '-' + filename);
		var regex_result = ext_re.exec(filename);
		var ext = (regex_result && regex_result.length >= 3 ? regex_result[2] : null);
		
		var commands = {
			'.cs' : ['mcs {inputFile} -o {outputFile}', './{outputFile}'],
			'.js' : ['', 'nodejs {outputFile}'],
			'.cpp' : ['clang++ {inputFile} -o {outputFile}', './{outputFile}'],
			'.py' : ['', 'python {outputFile}']//,
			//'.c' : ['clang {inputFile} -o {outputFile}', './{outputFile}'],
			//'.m' : ['clang {inputFile} -o {outputFile}', './{outputFile}'],
			//'.mm' : ['g++ {inputFile} -o {outputFile}', './{outputFile}'],
			//'.java' : ['javac {inputFile}', 'java {outputFile}'],
		};
		
		if(!commands[ext]) {
			response.write('Unknown file type: "' + ext + '" for filename: "' + filename + '"<br />');
			if(endFunc) {
				endFunc();
			}
			return;
		}
		
		response.write('<span>Compiling/interpreting submission for ' + solution + ' as file type: "' + ext + '"...</span><br />');
		
		var child;
		var executableName = 'output';
		var compilationCommand = commands[ext][0].replace('{inputFile}', " '" + solutionDirectory + '/' + filename + "'")
												.replace('{outputFile}', "'" + solutionDirectory + '/output_directory/' +  executableName + "'");
		
		var outDir = solutionDirectory + '/output_directory';		
		try {
			fs.mkdirSync(outDir); //bug(?) where mkdirSync does not properly handle quotes in string
		} catch(e) { }
				
		child = exec(compilationCommand, function(error, stdout, stderr) {
			var error_re = /error:/;
			var re_result = error_re.exec(stderr);
			
			//if(stderr && stderr.length) {
			if(re_result && re_result.length) {
				response.write('Compilation error: <br /><pre>' + stderr + '</pre><br />');
				console.log(stderr);
				if(endFunc) endFunc();
			}
			else {
				scoreSolution(solutionDirectory + '/output_directory/' + executableName, 1, team, response, function() {
					if(endFunc) {
						endFunc();
					}
				});
				
			}
		});
	}
	
	testSolution(1, function() {
		response.write('<hr />');
		testSolution(2, function() {
			response.write('<hr />');
			testSolution(3, function() {
				response.end('</body></html>');
			});
		});
	});
	
}


function saveSolutionSubmission(request) {	
	var body = [];
	request.on('data', function(chunk) {
		body.push(chunk);
	}).on('end', function() {
		body = Buffer.concat(body).toString();
		console.log('submission received: ' + body);
		
		var form = JSON.parse(body);		
		var dir = 'teams/' + form.YourTeam;//_Value;
		try {
			fs.mkdirSync(dir);
		} catch(e) { }
		
		function processSolution(solution, destDir) {
			if(solution.length === 0)
				return;
			
			var file = solution[0];
			var ext_re = /(.+)(\.[^.]+)$/;
			var base = ext_re.exec(file.Name)[1];
			var output_base = form.Id.toString() + '_' + form.Entry.Number.toString() + '_' + base;
			var ext = ext_re.exec(file.Name)[2];
			var output_name = Date.now() + '_' + output_base + ext;
			
			var solDir = dir + '/' + destDir;
			try {
				fs.mkdirSync(solDir);
			} catch(e) { }
			console.log('downloading file: ' + solDir + '/' + output_name);
			download(file.File,  solDir + '/' + output_name, function(err) {
				console.log(err);
			});			
		}
		processSolution(form.Solution1, 'solution1');
		processSolution(form.Solution2, 'solution2');
		processSolution(form.Solution3, 'solution3');		
	});	
}


http.createServer(function (request, response) {
	response.writeHead(200, {'Content-Type': 'text/html'});
	response.write('<html><head></head><body>');
	console.log('request = [' + request.method + ']: ' + request.url);
	if(request.method === 'POST' && request.url === '/upload_submission') {
		saveSolutionSubmission(request);
		response.end();
	}
	else if(request.method === 'GET' && request.url.startsWith('/results/')) {
		setTimeout(function() {
			getResults(request, response)
		}, 1000); //hack to wait for results file to be written
	}
	else if(request.method === 'GET' && request.url.startsWith('/leaderboard')) {
		getLeaderboard(response);
	}
   //debugger;
}).listen(8081);

// Console will print the message
console.log('Server running at http://127.0.0.1:8081/');
