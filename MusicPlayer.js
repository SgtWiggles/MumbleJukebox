var mumble = require('mumble');
var fs = require('fs');
var ffmpeg = require('fluent-ffmpeg');
const log = require('./Log.js');

const bufferSize = 2;
const maxRate = 1;

function getSecondsSinceEpoch() {
	return Math.floor(new Date().getTime() / 1000);
}

module.exports = {
	MusicPlayer : class {
		constructor(mumbleClient, options) {
			this.currentSong = null;
			this.startTime = 0;

			this.mumbleClient = mumbleClient;

			if (options) {
				if (options.sampleRate === undefined)
					options.sampleRate = 48000;
				if (options.channels === undefined)
					options.channels = 1;
				if (options.gain === undefined)
					options.gain = 0;
			} else {
				options = {sampleRate : 48000, channels : 1, gain : 1};
			}

			this.options = options;
			this.outputStream = null;
			this.ffmpegStream = null;

			this.onEnd = null;
			this.paused = false;
		}

		stop() {
			this.closeStreams();
			this.currentSong = null;
			this.onEnd = null;
			this.paused = false;
		}

		pause() {
			this.closeStreams();
			const now = getSecondsSinceEpoch();
			this.startTime = now - this.startTime;
			this.paused = true;
		}
		resume() {
			this.playImpl(this.currentSong, this.startTime, this.onEnd);
		}

		play(file, onEnd) {
			this.playImpl(file, 0, onEnd);
		}

		playImpl(file, startTime, onEnd) {
			if (!file)
				throw new Error("Tried to play a falsey file: " + file);

			this.stop();
			this.onEnd = onEnd;

			this.outputStream = this.mumbleClient.inputStream(this.options);
			this.ffmpegStream = ffmpeg(fs.createReadStream(file));

			// clang-format off
			this.ffmpegStream
				.addOutputOptions([
					'-f s16le', '-acodec pcm_s16le', 
					'-ac 1', 
					'-ar ' + this.options.sampleRate, 
					'-bufsize ' + bufferSize + 'M',
					'-maxrate ' + maxRate + 'M'
				])
				.on('start', (commandLine) => {
							log('Decoding ', file, ': ', commandLine);
							this.currentSong = file;
							this.startTime = getSecondsSinceEpoch();
				})
				.on('end', () => {
					log('Finished decoding: ', this.currentSong);
					this.stop();
					if(onEnd)
						onEnd(this);
				})
				.on('error',
					(err, stdout, stderr)=> {
						if(!err.message.includes('signal'))
							log(err);
				})
				.pipe(this.outputStream);
			//clang-format on
		}

		isPlaying() {
			return this.currentSong !== null;
		}

		isPaused() {
			return this.paused;
		}

		closeStreams() {
			if (this.outputStream ) {
				this.outputStream.close();
				this.outputStream = null;
			}
			if (this.ffmpegStream) {
				this.ffmpegStream.kill('SIGKILL');
				this.ffmpegStream = null;
			}
		}

		setVolume(vol) {
			if (vol < 0 || vol > 1 || isNaN(vol)) 
				throw new Error(`Invalid volume ${vol}. Volume must be in the range [0,1].`);
			
			if (vol === 0)
				vol = Number.EPSILON;
			
			this.options.gain = vol;

			if(this.outputStream)
				this.outputStream.setGain(this.options.gain);
			
			log('Set volume to:', vol);
		}
	}
}
