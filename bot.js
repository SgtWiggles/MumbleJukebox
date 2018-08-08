// Requires
// mumble
// sanitize-html
// lowdb
// fluent-ffmpeg

console.log('Starting bot');

var mumble = require('mumble');
console.log('Loaded Mumble');

var fs = require('fs');
console.log('Loaded fs');

var sanitizeHtml = require('sanitize-html');
console.log('Loaded sanitize-html');

var path = require('path');
console.log('Loaded path');

const lowdb = require('lowdb');
console.log('Loaded lowdb');

const FileSync = require('lowdb/adapters/FileSync');
console.log('Loaded FileSync');

const {exec} = require('child_process');
console.log('Loaded child_process');

const ytdl = require('ytdl-core');
console.log('Loaded ytdl-core');

var ffmpeg = require('fluent-ffmpeg');
console.log('Loaded fluent-ffmpeg');

console.log('Loaded requires');

const isWindows = (process.platform == 'win32');
function getWindowsErrorString(command) {
	return `Sorry, ${command} is not supported when the bot is hosted on Windows`;
}

var options = {};
var audioStream = null;
var ffmpegStream = null;

var mumbleClient;

const songSampleRate = 48000;
const bufSize = 2;
const maxRate = 1;
const settingsFile = 'settings.json';

var currentSong = undefined;

var songdb = lowdb(new FileSync('db.json'));

var settings = {url : 'some.server:9999', name : 'Mumble Bot', commandPrefix : '!', volume : 0.2, songQueue : []}

var saveSettings = function() {
	var settingsStr = JSON.stringify(settings, undefined, 2);
	fs.writeFileSync(settingsFile, settingsStr, function(err) {
		if (err) {
			throw err;
		}
		console.log("Saving settings file to disk");
	});
};

if (fs.existsSync(settingsFile)) {
	var obj = JSON.parse(fs.readFileSync('./' + settingsFile));
	for (key in settings) {
		if (obj[key] !== undefined) {
			settings[key] = obj[key];
		}
	}
} else {
	saveSettings();
}

var queueSong = function(id) {
	console.log('Queuing: ' + id + '; New queue: ' + settings.songQueue);
	settings.songQueue.push(id);
	saveSettings();

	if (currentSong === undefined) {
		playSong(dequeSong());
	}
};

var dequeSong = function() {
	var ret = settings.songQueue.shift();
	saveSettings();
	console.log('Dequeing: ' + ret + '; New queue: ' + settings.songQueue);
	return ret;
};

var ffmpegCommand = function(cmd) {
	if (ffmpegStream !== null && ffmpegStream !== undefined) {
		ffmpegStream.kill(cmd);
		if (cmd === 'SIGKILL') {
			ffmpegStream = null;
		}
	}
};

var playSong = function(id) {
	if (ffmpegStream !== null) {
		audioStream.setGain(Number.EPSILON);
		ffmpegCommand('SIGSTOP');
		ffmpegCommand('SIGKILL');
		while (ffmpegStream !== null) {
		};
	}

	if (id === undefined) {
		var keys = Object.keys(songdb.value());
		var selected = keys[Math.floor(Math.random() * keys.length)];
		console.log("Shuffling: " + keys + " | Selected: " + selected);
		playSong(selected);
		return;
	}

	var file = (__dirname + '/' + songdb.get(id).value().file);
	audioStream = mumbleClient.inputStream({sampleRate : songSampleRate, channels : 1, gain : settings.volume});
	ffmpegStream = ffmpeg(fs.createReadStream(file));

	if (isWindows) {
		ffmpegStream.setFfmpegPath(__dirname + '/ffmpeg.exe');
	}

	ffmpegStream
			.addOutputOptions([
				'-f s16le', '-acodec pcm_s16le', '-ac 1', '-ar ' + songSampleRate, '-bufsize ' + bufSize + 'M',
				'-maxrate ' + maxRate + 'M'
			])
			.on('start',
					function(commandLine) {
						console.log('Started decoding audio: ', commandLine);
						currentSong = id;
					})
			.on('end',
					function() {
						console.log('Audio decoding finished');
						playSong(dequeSong());
					})
			.on('error',
					function(err, stdout, stderr) {
						console.log('ffmpeg stdout:\n' + stdout);
						console.log('ffmpeg stderr:\n' + stderr);
					})
			.pipe(audioStream);
};

var downloadVideo = {
	func : function(message, user, scope) {
		let fileExtension = '.m4a';

		message.splice(0, 1);

		if (!ytdl.validateURL(message[0])) {
			console.log('Invalid url: "' + message[0] + '"');
			return;
		}

		var url = message[0];
		var id = ytdl.getURLVideoID(url)

		if (!songdb.has(id).value()) {
			console.log('db does not have ' + id);
			ytdl.getInfo(url, [], function(err, info) {
				if (err)
					throw err;

				var audioFormat = ytdl.chooseFormat(info.formats, {filter : 'audioonly', quality : 'highestaudio'});
				if (!audioFormat)
					throw 'Could not find an audio format to use!';

				var filePath = './music/' + id + '.' + audioFormat.container;
				console.log('Downloading to: ' + filePath);

				var video = ytdl.downloadFromInfo(info, {format : audioFormat});
				video.pipe(fs.createWriteStream(filePath));

				video.on('end', () => {
					console.log('Finished fetching song: ' + id + ', title ' + info.title);
					songdb.set(id, {title : info.title, file : filePath, who: user.name}).write();
					queueSong(id);
				});
			});
		} else {
			console.log('Song already downloaded: ' + id);
			queueSong(id);
		}
	},
	help : `Downloads and adds it onto the playlist. Usage: ${settings.commandPrefix}dl &lt;youtube url&gt;`
};

var pausePlayback = {
	func : function(message, user, scope) {
		if (isWindows) {
			user.channel.sendMessage(getWindowsErrorString(message[0]));
			return;
		}
		ffmpegCommand('SIGSTOP');
	},
	help : "Pauses the music playback."
};

var playPlayback = {
	func : function(message, user, scope) {
		if (isWindows) {
			user.channel.sendMessage(getWindowsErrorString(message[0]));
			return;
		}
		if (ffmpegStream === null) {
			playSong(dequeSong());
		} else {
			ffmpegCommand('SIGCONT');
		}
	},
	help : "The bot resumes playing music."
};

var replayPlayback = {
	func : function(message, user, scope) {
		playSong(currentSong);
	},
	help : "Replays the current song."
};

var nextSong = {
	func : function(message, user, scope) {
		if (isWindows) {
			user.channel.sendMessage("Command not supported when bot is hosted on Windows")
			return;
		}
		playSong(dequeSong());
	},
	help : "Skips the current song and plays the next song."
};

var quitCommand = {
	func : function(message, user, scope) {
		saveSettings();
		process.exit();
	},
	help : "Forces the bot to leave the server."
};

var volumeCommand = {
		func : function(message, user, scope) {
			if (message.length <= 1) {
				user.channel.sendMessage("Current volume: " + (settings.volume * 100));
				return;
			}
			console.log(message);

			var vol = parseFloat(message[1]);
			if (vol < 0 || vol > 100 || isNaN(vol)) {
				user.channel.sendMessage("Volume must be a number in the range [0,100]. Given volume was " + message[1]);
				return;
			}

			vol = vol / 100;
			if (vol == 0)
				vol = Number.EPSILON;

			settings.volume = vol;
			if (audioStream !== null) {
				audioStream.setGain(settings.volume);
			}
			saveSettings();

			console.log('Set volume to:', vol);
	},
	help : `Sets the volume of the bot. Usage: ${settings.commandPrefix}vol [0,100]`
}

var titleCommand = {
		func : function(message, user, scope) {
			if (currentSong === undefined) {
				user.channel.sendMessage('No song is currently being played. ' +
																 'Use this command when a song is being played');
			return;
		}
		var title = songdb.get(currentSong).value().title;
		user.channel.sendMessage(`Current song title: ${title}`);
	},
	help : "Gets the title of the song currently playing"
}

var whoCommand = {
	func : function(message, user, scope){
		if(currentSong === undefined){
			user.channel.sendMessage('No song is currently being played. ' 	+
						 'Use this command when a song is being played');
			return;
		}

		var who = songdb.get(currentSong).value().who;
		if(who === undefined) who = "unknown";
		user.channel.sendMessage(`Requester for the current song: ${who}`);
	},
	help : `Gets who requested the currently playing song.`
}

var comeCommand = {
	func : function(message, user, scope) {
		user.channel.join();
	},
	help : "The bot comes into the same channel as you."
}

var infoCommand= {
	func : function(message, user, scope) {
		if(currentSong === undefined) {
			user.channel.sendMessage('No song is currently being played. ' 	+
						 'Use this command when a song is being played');
			return;
		}

		var msgString = ``;
		var title = songdb.get(currentSong).value().title;
		var who = songdb.get(currentSong).value().who;
		if(who === undefined) who = "unknown";
		user.channel.sendMessage(`<br/>Title: ${title}<br/>Requester: ${who}<br/>`);
	},
	help: "Gets information about the current song"
}

var removeCommand = {
	func : function(message, user, scope){
		if(currentSong === undefined) {
			user.channel.sendMessage('No song is currently being played. ' 	+
						 'Use this command when a song is being played');
			return;
		}
		console.log(`Attempting to remove ${currentSong}`);
		songdb.unset(currentSong).write();
	},
	help: "Removes the currently playing song from the playlist"
}


var commands = {
	'come' : comeCommand,
	'dl' : downloadVideo,
	'vol' : volumeCommand,
	'next' : nextSong,
	'skip' : nextSong,
	'n' : nextSong,

	'stop' : pausePlayback,
	'pause' : pausePlayback,

	'play' : playPlayback,
	'resume' : playPlayback,

	'replay' : replayPlayback,
	'restart' : replayPlayback,
	'r' : replayPlayback,

	'title' : titleCommand,
	'who' : whoCommand,
	'info' : infoCommand,
	'remove' : removeCommand
};

console.log('Connecting');
mumble.connect(settings.url, options, function(error, con) {
	if (error) {
		throw new Error(error);
		console.log('Connection failed');
	}

	console.log('Connected');

	con.authenticate(settings.name);
	con.on('initialized', onInit);
	con.on('message', onMessage);
	mumbleClient = con;
});

var onInit = function() {
	console.log('Connection established');
};

var hasPrefix = function(string, prefix) {
	var len = prefix.length;
	var str = string.substr(0, len);
	return (str === prefix);
};

commands['h'] = commands['help'] = {
	help : `Displays the help dialog. Usage: ${settings.commandPrefix}h &lt;command&gt; or ${settings.commandPrefix}h`,
	func : function(message, user, scope) {
		if (message.length == 1) {
			var retString = "";
			for (key in commands) {
				const helpString = commands[key].help;
				retString = retString + `${settings.commandPrefix}${key} : ${helpString}<br/>`;
			}
			user.channel.sendMessage(retString);
		} else if (message.length == 2) {
			const obj = commands[message[1]];
			if (obj === undefined) {
				user.channel.sendMessage(`'${message[1]}' is not a valid command`);
			} else {
				user.channel.sendMessage(`${settings.commandPrefix}${message[1]} : ${obj.help}<br/>`);
			}
		}
	}
};

var onMessage = function(message, user, scope) {
	console.log('----------------------onMessage----------------------');
	console.log('Received message: "' + message + '"');
	message = sanitizeHtml(message, {allowedTags : [], allowedAttributes : []});
	message = message.replace(/\s/g, ' ').replace(/\s\s+/g, ' ').trim();
	var strings = message.split(' ');

	if (strings.length < 0)
		return;

	if (hasPrefix(strings[0], settings.commandPrefix)) {
		strings[0] = strings[0].substr(settings.commandPrefix.length);
		process.stdout.write('Command string: "' + strings[0] + '" -> ');
		const object = commands[strings[0]];
		if (object === undefined) {
			process.stdout.write('Not found!\n');
		} else {
			process.stdout.write('Found!\n');
			object.func(strings, user, scope);
		}
	}
	console.log('-----------------------------------------------------');
};
