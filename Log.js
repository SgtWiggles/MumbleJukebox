module.exports =
		function() {
	var args = Array.prototype.slice.call(arguments);
	args.unshift(getLogPrefix() + ' ');
	console.log.apply(console, args);
}

function
getLogPrefix() {
	return '[' + new Date().toLocaleString() + ']';
}
