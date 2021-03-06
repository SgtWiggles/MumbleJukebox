// Requires
// mumble
// sanitize-html
// lowdb
// fluent-ffmpeg

const log = require('./Log.js');
log('Starting bot');

var mumble = require('mumble');
log('Loaded Mumble');

var fs = require('fs');
log('Loaded fs');

var sanitizeHtml = require('sanitize-html');
log('Loaded sanitize-html');

var path = require('path');
log('Loaded path');

const lowdb = require('lowdb');
log('Loaded lowdb');

const FileSync = require('lowdb/adapters/FileSync');
log('Loaded FileSync');

const {exec} = require('child_process');
log('Loaded child_process');

const ytdl = require('ytdl-core');
log('Loaded ytdl-core');

var ffmpeg = require('fluent-ffmpeg');
log('Loaded fluent-ffmpeg');

const assert = require('assert');
log('Loaded assert');

const Playlist = require('./Playlist.js');
log('Loaded playlist');

const MusicPlayer = require('./MusicPlayer.js');
log('Loaded MusicPlayer')

log('Finished loading requires');

const isWindows = (process.platform == 'win32');
function getWindowsErrorString(command) {
	return `Sorry, ${command} is not supported when the bot is hosted on Windows`;
}

String.prototype.toMMSS =
		function() {
	var sec_num = parseInt(this, 10);
	var minutes = Math.floor(sec_num / 60);
	var seconds = sec_num - (minutes * 60);

	if (seconds < 10) {
		seconds = "0" + seconds;
	}

	return '' + minutes + ':' + seconds;
}

var options = {};

var mumbleClient;

const settingsFile = 'settings.json';
const playlistFile = 'playlist.json';
const databaseFile = 'db.json';

const adapter = new FileSync(databaseFile);
const songdb = lowdb(adapter);

var playlist = new Playlist.Playlist(playlistFile);
if (!fs.existsSync(playlistFile)) {
	var objects = songdb.getState();
	playlist.songs = [];
	for (var key in objects) {
		playlist.songs.push(key);
	}
	playlist.saveToFile();
}
playlist.loadFromFile();

var musicPlayer = null;

let settings = {url : 'some.server:9999', name : 'Mumble Bot', commandPrefix : '!', volume : 0.2};

var saveSettings = function() {
	let settingsStr = JSON.stringify(settings, undefined, 2);
	fs.writeFileSync(settingsFile, settingsStr, function(err) {
		if (err) {
			throw err;
		}
		log("Saving settings file to disk");
	});
};

if (fs.existsSync(settingsFile)) {
	let obj = JSON.parse(fs.readFileSync('./' + settingsFile));
	for (key in settings) {
		if (key in obj) {
			settings[key] = obj[key];
		}
	}
} else {
	saveSettings();
}

var playSong = function(id) {
	var file = (__dirname + '/' + songdb.get(id).value().file);
	// clang-format off
	musicPlayer.play(file, (player) => {
		playSong(playlist.manipulate((pl) => {
			return pl.next();
		}))
	});
	// clang-format on
};

var downloadVideo = {
	names : [ 'dl', 'download' ],
	func : function(message, user, scope) {
		message.splice(0, 1);

		if (!ytdl.validateURL(message[0])) {
			log('Invalid url: "' + message[0] + '"');
			return;
		}

		var url = message[0];
		var id = ytdl.getURLVideoID(url)

		if (!songdb.has(id).value()) {
			log('db does not have ' + id);
			ytdl.getInfo(url, [], function(err, info) {
				if (err)
					throw err;

				var audioFormat = ytdl.chooseFormat(info.formats, {filter : 'audioonly', quality : 'highestaudio'});
				if (!audioFormat)
					throw 'Could not find an audio format to use!';

				var filePath = './music/' + id + '.' + audioFormat.container;
				log('Downloading to: ' + filePath);

				var video = ytdl.downloadFromInfo(info, {format : audioFormat});
				video.pipe(fs.createWriteStream(filePath));

				video.on('end', () => {
					var songLen = info.length_seconds.toMMSS()
					log('Fetched song: ' + id + ', title ' + info.title + ' |  Song len ' + songLen);

					songdb.set(id, {title : info.title, file : filePath, who : user.name, length : songLen}).write();
					playlist.manipulate(function(pl) {
						pl.insertSong(id);
					});
				});
			});
		}
		else {
			log('Song already downloaded: ' + id);
			playlist.manipulate(function(pl) {
				pl.insertSong(id);
			});
		}
	},
	help : `Downloads and adds it onto the playlist. Usage: ${settings.commandPrefix}dl &lt;youtube url&gt;`
};

var pausePlayback = {
	names : [ 'pause', 'stop', 's' ],
	func : function(message, user, scope) {
		if (isWindows) {
			user.channel.sendMessage(getWindowsErrorString(message[0]));
			return;
		}
		musicPlayer.pause();
	},
	help : "Pauses the music playback."
};

var playPlayback = {
	names : [ 'play', 'p' ],
	func : function(message, user, scope) {
		if (isWindows) {
			user.channel.sendMessage(getWindowsErrorString(message[0]));
			return;
		}
		if (musicPlayer.isPaused()) {
			musicPlayer.resume();
		} else if (!musicPlayer.isPlaying()) {
			playSong(playlist.manipulate((pl) => {
				return pl.next();
			}));
		}
	},
	help : "The bot resumes playing music."
};

var replayPlayback = {
	names : [ 'replay', 'restart', 'r' ],
	func : function(message, user, scope) {
		if (musicPlayer.isPaused()) {
			user.channel.sendMessage('No song is currently being played. ' +
															 'Use this command when a song is being played');
			return;
		}
		playSong(playlist.current());
	},
	help : "Replays the current song."
};

var nextSong = {
	names : [ 'next', 'n' ],
	func : function(message, user, scope) {
		if (isWindows) {
			user.channel.sendMessage("Command not supported when bot is hosted on Windows")
			return;
		}
		playSong(playlist.manipulate((pl) => {
			return pl.next();
		}));
	},
	help : "Skips the current song and plays the next song."
};

var prevSong = {
	names : [ 'previous', 'prev', 'back', 'b' ],
	func : function(message, user, scope) {
		if (isWindows) {
			user.channel.sendMessage("Command not supported when bot is hosted on Windows")
			return;
		}
		playSong(playlist.manipulate((pl) => {
			return pl.previous();
		}));
	},
	help : "Plays the previously played song."
}

var quitCommand = {
	names : [ 'quit' ],
	func : function(message, user, scope) {
		saveSettings();
		process.exit();
	},
	help : "Forces the bot to leave the server."
};

var volumeCommand = {
	names : [ 'volume', 'vol', 'v' ],
	func : function(message, user, scope) {
		if (message.length <= 1) {
			user.channel.sendMessage("Current volume: " + (settings.volume * 100));
			return;
		}

		var vol = parseFloat(message[1]);
		if (vol < 0 || vol > 100 || isNaN(vol)) {
			user.channel.sendMessage("Volume must be a number in the range [0,100]. Given volume was " + message[1]);
			return;
		}

		vol = vol / 100;

		settings.volume = vol;
		musicPlayer.setVolume(vol);

		saveSettings();
	},
	help : `Sets the volume of the bot. Usage: ${settings.commandPrefix}vol [0,100]`
}

var comeCommand = {
	names : [ 'come' ],
	func : function(message, user, scope) {
		user.channel.join();
	},
	help : "The bot comes into the same channel as you."
}

var infoCommand = {
	names : [ 'info', 'i' ],
	func : function(message, user, scope) {
		var sendMessage =
				function(songTitle, songLength, songUrl, songReq) {
			user.channel.sendMessage(`<br/>
Title: ${songTitle}<br/>
Length: ${songLength}<br/>
URL: <a href="${songUrl}">${songUrl}</a><br/>
Requester: ${songReq}<br/>`);
		}

		const curSong = playlist.current();
		var msgString = ``;
		var songObj = songdb.get(curSong).value();

		var title = songObj.title;
		var who = songObj.who;
		if (who === undefined)
			who = "unknown";

		const youtubePrefixString = "https://www.youtube.com/watch?v=";
		const url = youtubePrefixString + curSong
		var length = songObj.length;
		if (length === undefined) {
			ytdl.getInfo(youtubePrefixString + curSong, [], function(err, info) {
				if (err)
					throw err;
				var songLen = info.length_seconds.toMMSS();
				songdb.get(curSong).assign({length : songLen}).write();
				sendMessage(title, songLen, url, who);
			});
		} else {
			sendMessage(title, length, url, who);
		}
	},
	help : "Gets information about the current song"
}

var removeCommand = {
	names : [ 'remove' ],
	func : function(message, user, scope) {
		if (!musicPlayer.isPlaying()) {
			user.channel.sendMessage('No song is currently being played. ' +
															 'Use this command when a song is being played');
			return;
		}

		const curSong = playlist.current();
		log(`Attempting to remove ${curSong}`);
		const nextSong = playlist.manipulate((pl) => {
			pl.removeSong(curSong);
			return pl.next();
		});
		songdb.unset(curSong).write();
		playSong(nextSong);
	},
	help : "Removes the currently playing song from the playlist"
}

var playlistCommand = {
	names : [ 'playlist', 'pl' ],
	func : function(message, user, scope) {
		const youtubePrefixString = "https://www.youtube.com/watch?v=";
		var items = 5;
		var msg = `<br/>`;
		for (var i = -items; i <= items; ++i) {
			var idx = playlist.get(i);
			var url = youtubePrefixString + idx;
			var songObj = songdb.get(idx).value();
			msg = msg + `${i}) ${songObj.title}  -->  <a href="${url}">${url}</a>  <br/>\n`;
		}
		user.channel.sendMessage(msg);
	},
	help : "Displays some of the previous and upcoming songs"
}

var shuffleCommand = {
	names : [ 'shuffle' ],
	func : function(message, user, scope) {
		playlist.manipulate((pl) => {
			pl.shuffle();
		});
	},
	help : "Shuffles the playlist."
}

var commands = [
	comeCommand, downloadVideo, volumeCommand, nextSong, prevSong, pausePlayback, playPlayback, replayPlayback,
	infoCommand, removeCommand, playlistCommand, shuffleCommand
];

log('Connecting');
mumble.connect(settings.url, options, function(error, con) {
	if (error) {
		throw new Error(error);
		log('Connection failed');
	}

	log('Connected');

	con.authenticate(settings.name);
	con.on('initialized', onInit);
	con.on('message', onMessage);
	con.on('user-move', onUserMove);
	con.on('user-disconnect', onUserMove);
	musicPlayer = new MusicPlayer.MusicPlayer(con);
	mumbleClient = con;
});

var onInit = function() {
	log('Connection established');
};

var hasPrefix = function(string, prefix) {
	var len = prefix.length;
	var str = string.substr(0, len);
	return (str === prefix);
};

const helpCommand = {
	names : [ 'h', 'help' ],
	help : `Displays the help dialog. Usage: ${settings.commandPrefix}h &lt;command&gt; or ${settings.commandPrefix}h`,
	func : function(message, user, scope) {
		const buildCommandList = (list) => {
			let retString = '';
			let spacer = ', ';
			for (var k in list) {
				const name = list[k];
				retString = retString + `${settings.commandPrefix}${name}` + spacer;
			}
			if (retString.length > spacer.length)
				retString = retString.substr(0, retString.length - spacer.length);
			return retString;
		};

		if (message.length == 1) {
			var retString = "Displaying commands:<br/>";
			for (key in commands) {
				const helpString = commands[key].help;
				const commandString = buildCommandList(commands[key].names);
				retString = retString + `${commandString} : ${helpString}<br/>`;
			}
			user.channel.sendMessage(retString);
		} else if (message.length == 2) {
			const obj = commands.find((elem) => {
				return elem.names.find((inner) => {
					return inner === message[1];
				}) !== undefined;
			});
			if (obj === undefined) {
				user.channel.sendMessage(`'${message[1]}' is not a valid command`);
			} else {
				const commandList = buildCommandList(obj.names);
				user.channel.sendMessage(`${commandList} : ${obj.help}<br/>`);
			}
		}
	}
};
commands.push(helpCommand);

var onMessage = function(message, user, scope) {
	log('----------------------onMessage----------------------');
	log('Received message: "' + message + '"', " from user: ", user.name);
	message = sanitizeHtml(message, {allowedTags : [], allowedAttributes : []});
	message = message.replace(/\s/g, ' ').replace(/\s\s+/g, ' ').trim();
	var strings = message.split(' ');

	if (strings.length < 0)
		return;

	if (hasPrefix(strings[0], settings.commandPrefix)) {
		strings[0] = strings[0].substr(settings.commandPrefix.length);
		const obj = commands.find((elem) => {
			return (elem.names.find((inner) => {
				return inner === strings[0];
			}) !== undefined);
		});
		if (obj === undefined) {
			log('Command string: "' + strings[0] + ' -> Not found!');
		} else {
			log('Command string: "' + strings[0] + ' -> Found!');
			obj.func(strings, user, scope);
		}
	}
	log('-----------------------------------------------------');
};

var onUserMove = function(user) {
	log('User ' + user.name + ' moved or disconnected');
	// Only the bot in the channel.
	if (mumbleClient.user.channel.users.length === 1) {
		if (musicPlayer.isPlaying() && !musicPlayer.isPaused()) {
			log('Empty channel, stopping music');
			musicPlayer.pause();
		}
	}
}
