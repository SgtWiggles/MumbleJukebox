# Mumble Jukebox
A Mumble bot that plays and downloads music from Youtube over Mumble.
Users can control the bot using text commands in Mumble.  
So far the jukebox has been run on DietPi. It can be run on Windows, but the bot will lack some commands (pause, stop, play, next).

Don't expect the code to be good, this was hacked together as a weekend project. Most of the code is undocumented.

### Installation
Ensure python, nodejs and ffmpeg are installed on the system.   
Clone the repository, then run `npm install` in the directory.  
The bot can the be run using `node ./bot.js`  

### Configuration
The jukebox automatically generates a config file when it is first run.  
In the config file you can set the name of the bot, the server it's supposed to connect to and the command prefix.
