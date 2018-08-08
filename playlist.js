let fs = require('fs');
let assert = require('assert');

module.exports = {
	Playlist : class { // TODO saving idx and stuff
		constructor(file) {
			this.songs = [];
			this.idx = 0;
			this.insertPosition = 0;
			this.file = file;
		}

		insertSong(songId) {
			if (this.songs.length == 0)
				this.songs.push(songId);

			let songidx = this.songs.find(function(element) {
				return element == songId;
			});

			if (songidx !== undefined) {
				this.songs.push(songId);
				songidx = this.songs.length - 1;
				this.idx += 1;
				this.insertPosition += 1;
			}

			if (songidx <= this.idx || songidx > this.insertPosition) {
				let tmp = this.songs[this.insertPosition];
				this.songs[this.insertPosition] = this.songs[songidx];
				this.songs[songidx] = tmp;
			}
			this.insertPosition += 1;
		}

		removeSong(songId) {
			for (var k in this.songs) {
				const obj = this.songs[k];
				if (obj === songId) {
					this.songs.splice(k, 1);
					this.idx -= 1;
					this.insertPosition -= 1;
					return;
				}
			}
		}

		current() {
			return this.songs[(this.idx % this.songs.length)];
		}

		next() {
			this.idx += 1;
			if (this.idx >= this.insertPosition)
				this.insertPosition = this.idx + 1;

			return this.current();
		}

		previous() {
			this.idx -= 1;
			return this.current();
		}

		shuffle() {
			for (var i = songs.length - 1; i >= 0; --i) {
				var idx = Math.floor(Math.random() * i);
				var tmp = songs[i];
				song[i] = songs[idx];
				songs[idx] = tmp;
			}
		}

		first() {
			this.idx = 0;
			this.insertPosition = 1;
			return this.songs[this.idx];
		}
		last() {
			this.idx = this.songs.length - 1;
			this.insertPosition = this.songs.length;
			return this.songs[this.idx];
		}

		saveToFile() {
			let str = JSON.stringify(this, undefined, 2);
			fs.writeFileSync(this.file, str, function(err) {
				if (err)
					throw err;
			});
		}

		loadFromFile() {
			let obj = JSON.parse(fs.readFileSync(this.file));
			this.songs = obj.songs;
			this.idx = obj.idx;
			this.insertPosition = obj.insertPosition;
			this.file = obj.file;
		}

		manipulate(func) {
			let ret = func(this);
			this.saveToFile();
			return ret;
		}
	}
}
