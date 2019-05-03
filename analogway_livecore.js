var tcp = require('../../tcp');
var instance_skel = require('../../instance_skel');
var debug;
var log;

function instance(system, id, config) {
	var self = this;

	this.firmwareVersion = "0";
	this.numOutputs = 0;
	this.numInputs = 0;
	this.modelnum;
	this.modelname = '';

	// super-constructor
	instance_skel.apply(this, arguments);

	self.actions(); // export actions

	return self;
}


instance.prototype.init = function() {
	var self = this;

	debug = self.debug;
	log = self.log;

	self.init_tcp();
};

instance.prototype.init_tcp = function() {
	var self = this;
	var receivebuffer = '';

	if (self.socket !== undefined) {
		self.socket.destroy();
	}

	if (self.config.host) {
		self.socket = new tcp(self.config.host, 10500);

		self.socket.on('status_change', function (status, message) {
			self.status(status, message);
		});

		self.socket.on('error', function (err) {
			debug("Network error", err);
			self.log('error',"Network error: " + err.message);
		});

		self.socket.on('connect', function () {
			debug("Connected");
			self.sendcmd("");
		});

		// separate buffered stream into lines with responses
		self.socket.on('data', function (chunk) {
			var i = 0, line = '', offset = 0;
			receivebuffer += chunk;
			while ( (i = receivebuffer.indexOf('\r\n', offset)) !== -1) {
				line = receivebuffer.substr(offset, i - offset);
				offset = i + 1;
				self.socket.emit('receiveline', line.toString());
			}
			receivebuffer = receivebuffer.substr(offset);
		});

		self.socket.on('receiveline', function (line) {
			debug("Received line from Livecore:", line);

			if (line.match(/TPcon\d,\d+/)) {
				if (line.match(/TPcon0,\d+/) == null) {
					self.log('error',"Connected to "+ self.config.label +", but this is not the master of stacked configuation! Closing connection now.");
					self.socket.destroy();
				}
					var connectedDevices = parseInt(line.match(/TPcon0,(\d)/)[1]);
					if (connectedDevices < 4) {
						self.log('info',self.config.label +" has " + (connectedDevices-1) + " other connected controller(s).");
						self.sendcmd("?");
					}	else if (connectedDevices == 4) {
						self.log(warn,self.config.label +" has 4 other connected controllers. Maximum reached.");
						self.sendcmd("?");
					} else {
						self.log('error',self.config.label +" connections limit has been reached! Max 5 controllers possible, but it is " + connectedDevices + "! Closing connection now.");
						self.socket.destroy(); // TODO: there should be a possibility for the user to reconnect
					}

			}
			if (line.match(/DEV\d+/)) {
				this.model = parseInt(line.match(/DEV(\d+)/)[1]);
				switch (this.model) {
					case 97: this.modelname = 'NeXtage 16'; break;
					case 98: this.modelname = 'SmartMatriX Ultra'; break;
					case 99: this.modelname = 'Ascender 32'; break;
					case 100: this.modelname = 'Ascender 48'; break;
					case 102: this.modelname = 'Output Expander 16'; break;
					case 103: this.modelname = 'Output Expander 32'; break;
					case 104: this.modelname = 'Output Expander 48'; break;
					case 105: this.modelname = 'NeXtage 16 - 4K'; break;
					case 106: this.modelname = 'SmartMatriX Ultra - 4K'; break;
					case 107: this.modelname = 'Ascender 32 - 4K'; break;
					case 108: this.modelname = 'Ascender 48 - 4K'; break;
					case 112: this.modelname = 'Ascender 16'; break;
					case 113: this.modelname = 'Ascender 16 - 4K'; break;
					case 114: this.modelname = 'Ascender 48 - 4K - PL'; break;
					case 115: this.modelname = 'Output Expander 48 - 4K  - PL'; break;
					case 116: this.modelname = 'NeXtage 08'; break;
					case 117: this.modelname = 'NeXtage 08 - 4K'; break;
					case 118: this.modelname = 'Ascender 32 - 4K -PL'; break;
					case 119: this.modelname = 'Output Expander 32 - 4K - PL'; break;
					default: this.modelname = 'unknown'; break;
				}
				self.log('info', self.config.label +" Type is "+ this.modelname);
				self.sendcmd("0,TPver");
			}

			if (line.match(/TPver\d+/)) {
				var commandSetVersion = parseInt(line.match(/TPver\d+,(\d+)/)[1]);
				self.log('info', "Command set version of " + self.config.label +" is " + commandSetVersion);
				// TODO: Should check the machine state now, will be implemented after feedback system is done
			}

			if (line.match(/TPdie0/)) {
				//There is no parameter readback runnning, it can be started now
			}


			if (line.match(/E\d{2}/)) {
				switch (parseInt(line.match(/E(\d{2})/)[1])) {
					case 10: self.log('error',"Received command name error from "+ self.config.label +": "+ line); break;
					case 11: self.log('error',"Received index value out of range error from "+ self.config.label +": "+ line); break;
					case 12: self.log('error',"Received index count (too few or too much) error from "+ self.config.label +": "+ line); break;
					case 13: self.log('error',"Received value out of range error from "+ self.config.label +": "+ line); break;
					default: self.log('error',"Received unspecified error from Livecore "+ self.config.label +": "+ line);
				}
			}

		});

	}
};

// Return config fields for web config
instance.prototype.config_fields = function () {
	var self = this;

	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'IP-Adress of Livecore Unit',
			width: 6,
			default: '192.168.2.140',
			regex: self.REGEX_IP,
			tooltip: 'Enter the IP-adress of the Livecore unit you want to control. The IP of the unit can be found on the frontpanel LCD.\nIf you want to control stacked configurations, please enter the IP of the master unit.'
		},{
			type: 'dropdown',
			label: 'Variant',
			id: 'variant',
			default: '1',
			choices: [
				{ id: '1', label: 'ASC4806' },
				{ id: '2', label: 'ASC3204' },
				{ id: '3', label: 'ASC1602' },
				{ id: '4', label: 'NXT1604' },
				{ id: '5', label: 'NXT0802' },
				{ id: '6', label: 'SMX12x4' }
			]
		}
	]
};

// When module gets deleted
instance.prototype.destroy = function() {
	var self = this;

	if (self.socket !== undefined) {
		self.socket.destroy();
	}

	debug("destroy", self.id);;
};

instance.prototype.actions = function(system) {
	var self = this;
	self.system.emit('instance_actions', self.id, {
				/*
					 Note: For self generating commands use option ids 0,1,...,5 and 'value'.
					The command will be of the form [valueof0],[valueof1],...[valueof5],[valueofvalue][CommandID]
					for set-commands you need a value, for get-commands you mustn't have a value
					for simple commands the value can be hardcoded in the CommandID, like "1SPtsl".
				*/

			'sendcustomcommand': {
				label: 'Send custom command',
				options: [{
					type: 'textinput',
					label: 'Command',
					id: 'command',
					default: '',
					tooltip: "Enter any command you like in plain ASCII. Beware of correct syntax, you mustn't enter the linebreak at the end of the command.",
					regex: '/^[\\w,]+$/i'
			}]}
	});
}

instance.prototype.action = function(action) {
	var self = this;
	var cmd = '';

	switch(action.action) {

		case 'sendcustomcommand':
			cmd = action.options.command;
			break;

		if (cmd == '') {
			return;
		} else {
			cmd = cmd.trim();
		}
		break;

		default:
			cmd = '';
			if (action.options) {
				for (var i = 0; i<= 5; i++) {
					if (action.options.hasOwnProperty(i) && action.options[i] != '') {
						cmd += action.options[i] + ',';
					}
				}
				if (action.options.hasOwnProperty('value') && action.options['value'] != '') {
					cmd += action.options['value'];
				}
			}
			cmd += action.action;
			break;
	}
	self.sendcmd(cmd);
};


instance.prototype.sendcmd = function(cmd) {
	var self = this;
	cmd +="\n";

	if (cmd !== undefined) {

		if (self.socket === undefined) {
			self.init_tcp();
		}

		// TODO: remove this when issue #71 is fixed
		if (self.socket !== undefined && self.socket.host != self.config.host) {
			self.init_tcp();
		}

		debug('sending tcp',cmd,"to",self.config.host);

		if (self.socket !== undefined && self.socket.connected) {
			self.socket.send(cmd);
		} else {
			debug('Socket not connected :(');
		}

	}
};

instance_skel.extendedBy(instance);
exports = module.exports = instance;
