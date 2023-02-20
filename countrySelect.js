// wrap in UMD - see https://github.com/umdjs/umd/blob/master/jqueryPlugin.js
(function (factory) {
	if (typeof define === "function" && define.amd) {
		define(["jquery"], function ($) {
			factory($, window, document);
		});
	} else if (typeof module === "object" && module.exports) {
		module.exports = factory(require("jquery"), window, document);
	} else {
		factory(jQuery, window, document);
	}
})(function ($, window, document, undefined) {
	"use strict";
	var pluginName = "countrySelect", id = 1, // give each instance its own ID for namespaced event handling
		defaults = {
			// Default country
			defaultCountry: "",
			// Position the selected flag inside or outside of the input
			defaultStyling: "inside",
			// don't display these countries
			excludeCountries: [],
			// Display only these countries
			onlyCountries: [],
			// The countries at the top of the list. Defaults to United States and United Kingdom
			preferredCountries: ["us", "gb"],
			// Set the dropdown's width to be the same as the input. This is automatically enabled for small screens.
			responsiveDropdown: ($(window).width() < 768 ? true : false),
		}, keys = {
			UP: 38,
			DOWN: 40,
			ENTER: 13,
			ESC: 27,
			BACKSPACE: 8,
			PLUS: 43,
			SPACE: 32,
			A: 65,
			Z: 90
		}, windowLoaded = false;
	// keep track of if the window.load event has fired as impossible to check after the fact
	$(window).on('load', function () {
		windowLoaded = true;
	});
	function Plugin(element, options) {
		this.element = element;
		this.options = $.extend({}, defaults, options);
		this._defaults = defaults;
		// event namespace
		this.ns = "." + pluginName + id++;
		this._name = pluginName;
		this.init();
	}
	Plugin.prototype = {
		init: function () {
			// Process all the data: onlyCountries, excludeCountries, preferredCountries, defaultCountry etc
			this._processCountryData();
			// Generate the markup
			this._generateMarkup();
			// Set the initial state of the input value and the selected flag
			this._setInitialState();
			// Start all of the event listeners: input keyup, selectedFlag click
			this._initListeners();
			// Return this when the auto country is resolved.
			this.autoCountryDeferred = new $.Deferred();
			// Get auto country.
			this._initAutoCountry();
			// Keep track as the user types
			this.typedLetters = "";

			return this.autoCountryDeferred;
		},
		/********************
		 *  PRIVATE METHODS
		 ********************/
		// prepare all of the country data, including onlyCountries, excludeCountries, preferredCountries and
		// defaultCountry options
		_processCountryData: function () {
			// set the instances country data objects
			this._setInstanceCountryData();
			// set the preferredCountries property
			this._setPreferredCountries();
		},
		// process onlyCountries array if present
		_setInstanceCountryData: function () {
			var that = this;
			if (this.options.onlyCountries.length) {
				var newCountries = [];
				$.each(this.options.onlyCountries, function (i, countryCode) {
					var countryData = that._getCountryData(countryCode, true);
					if (countryData) {
						newCountries.push(countryData);
					}
				});
				this.countries = newCountries;
			} else if (this.options.excludeCountries.length) {
				var lowerCaseExcludeCountries = this.options.excludeCountries.map(function (country) {
					return country.toLowerCase();
				});
				this.countries = allCountries.filter(function (country) {
					return lowerCaseExcludeCountries.indexOf(country.iso2) === -1;
				});
			} else {
				this.countries = allCountries;
			}
		},
		// Process preferred countries - iterate through the preferences,
		// fetching the country data for each one
		_setPreferredCountries: function () {
			var that = this;
			this.preferredCountries = [];
			$.each(this.options.preferredCountries, function (i, countryCode) {
				var countryData = that._getCountryData(countryCode, false);
				if (countryData) {
					that.preferredCountries.push(countryData);
				}
			});
		},
		// generate all of the markup for the plugin: the selected flag overlay, and the dropdown
		_generateMarkup: function () {
			// Country input
			this.countryInput = $(this.element);
			// containers (mostly for positioning)
			var mainClass = "country-select";
			if (this.options.defaultStyling) {
				mainClass += " " + this.options.defaultStyling;
			}
			this.countryInput.wrap($("<div>", {
				"class": mainClass
			}));
			var flagsContainer = $("<div>", {
				"class": "flag-dropdown"
			}).insertAfter(this.countryInput);
			// currently selected flag (displayed to left of input)
			var selectedFlag = $("<div>", {
				"class": "selected-flag"
			}).appendTo(flagsContainer);
			this.selectedFlagInner = $("<div>", {
				"class": "flag"
			}).appendTo(selectedFlag);
			// CSS triangle
			$("<div>", {
				"class": "arrow"
			}).appendTo(selectedFlag);
			// country list contains: preferred countries, then divider, then all countries
			this.countryList = $("<ul>", {
				"class": "country-list v-hide"
			}).appendTo(flagsContainer);
			if (this.preferredCountries.length) {
				this._appendListItems(this.preferredCountries, "preferred");
				$("<li>", {
					"class": "divider"
				}).appendTo(this.countryList);
			}
			this._appendListItems(this.countries, "");
			// Add the hidden input for the country code
			this.countryCodeInput = $("#" + this.countryInput.attr("id") + "_code");
			if (!this.countryCodeInput) {
				this.countryCodeInput = $('<input type="hidden" id="' + this.countryInput.attr("id") + '_code" name="' + this.countryInput.attr("name") + '_code" value="" />');
				this.countryCodeInput.insertAfter(this.countryInput);
			}
			// now we can grab the dropdown height, and hide it properly
			this.dropdownHeight = this.countryList.outerHeight();
			// set the dropdown width according to the input if responsiveDropdown option is present or if it's a small screen
			// if (this.options.responsiveDropdown) {
			// 	$(window).resize(function() {
			// 		$('.country-select').each(function() {
			// 			var dropdownWidth = this.offsetWidth;
			// 			$(this).find('.country-list').css("width", dropdownWidth + "px");
			// 		});
			// 	}).resize();
			// }
			this.countryList.removeClass("v-hide").addClass("hide");
			// this is useful in lots of places
			this.countryListItems = this.countryList.children(".country");
		},
		// add a country <li> to the countryList <ul> container
		_appendListItems: function (countries, className) {
			// Generate DOM elements as a large temp string, so that there is only
			// one DOM insert event
			var tmp = "";
			// for each country
			$.each(countries, function (i, c) {
				// open the list item
				tmp += '<li class="country ' + className + '" data-country-code="' + c.iso2 + '">';
				// add the flag
				tmp += '<div class="flag ' + c.iso2 + '"></div>';
				// and the country name
				tmp += '<span class="country-name">' + c.name + '</span>';
				// close the list item
				tmp += '</li>';
			});
			this.countryList.append(tmp);
		},
		// set the initial state of the input value and the selected flag
		_setInitialState: function () {
			var flagIsSet = false;
			// If the input is pre-populated, then just update the selected flag
			if (this.countryInput.val()) {
				flagIsSet = this._updateFlagFromInputVal();
			}
			// If the country code input is pre-populated, update the name and the selected flag
			var selectedCode = this.countryCodeInput.val();
			if (selectedCode) {
				this.selectCountry(selectedCode);
			}
			if (!flagIsSet) {
				// flag is not set, so set to the default country
				var defaultCountry;
				// check the defaultCountry option, else fall back to the first in the list
				if (this.options.defaultCountry) {
					defaultCountry = this._getCountryData(this.options.defaultCountry, false);
					// Did we not find the requested default country?
					if (!defaultCountry) {
						defaultCountry = this.preferredCountries.length ? this.preferredCountries[0] : this.countries[0];
					}
				} else {
					defaultCountry = this.preferredCountries.length ? this.preferredCountries[0] : this.countries[0];
				}
				this.defaultCountry = defaultCountry.iso2;
			}
		},
		// initialise the main event listeners: input keyup, and click selected flag
		_initListeners: function () {
			var that = this;
			// Update flag on keyup.
			// Use keyup instead of keypress because we want to update on backspace
			// and instead of keydown because the value hasn't updated when that
			// event is fired.
			// NOTE: better to have this one listener all the time instead of
			// starting it on focus and stopping it on blur, because then you've
			// got two listeners (focus and blur)
			this.countryInput.on("keyup" + this.ns, function () {
				that._updateFlagFromInputVal();
			});
			// toggle country dropdown on click
			var selectedFlag = this.selectedFlagInner.parent();
			selectedFlag.on("click" + this.ns, function (e) {
				// only intercept this event if we're opening the dropdown
				// else let it bubble up to the top ("click-off-to-close" listener)
				// we cannot just stopPropagation as it may be needed to close another instance
				if (that.countryList.hasClass("hide") && !that.countryInput.prop("disabled")) {
					that._showDropdown();
				}
			});
			// Despite above note, added blur to ensure partially spelled country
			// with correctly chosen flag is spelled out on blur. Also, correctly
			// selects flag when field is autofilled
			this.countryInput.on("blur" + this.ns, function () {
				if (that.countryInput.val() != that.getSelectedCountryData().name) {
					that.setCountry(that.countryInput.val());
				}
				that.countryInput.val(that.getSelectedCountryData().name);
			});
		},
		_initAutoCountry: function () {
			if (this.options.initialCountry === "auto") {
				this._loadAutoCountry();
			} else {
				if (this.defaultCountry) {
					this.selectCountry(this.defaultCountry);
				}
				this.autoCountryDeferred.resolve();
			}
		},
		// perform the geo ip lookup
		_loadAutoCountry: function () {
			var that = this;

			// 3 options:
			// 1) already loaded (we're done)
			// 2) not already started loading (start)
			// 3) already started loading (do nothing - just wait for loading callback to fire)
			if ($.fn[pluginName].autoCountry) {
				this.handleAutoCountry();
			} else if (!$.fn[pluginName].startedLoadingAutoCountry) {
				// don't do this twice!
				$.fn[pluginName].startedLoadingAutoCountry = true;

				if (typeof this.options.geoIpLookup === 'function') {
					this.options.geoIpLookup(function (countryCode) {
						$.fn[pluginName].autoCountry = countryCode.toLowerCase();
						// tell all instances the auto country is ready
						// TODO: this should just be the current instances
						// UPDATE: use setTimeout in case their geoIpLookup function calls this callback straight away (e.g. if they have already done the geo ip lookup somewhere else). Using setTimeout means that the current thread of execution will finish before executing this, which allows the plugin to finish initialising.
						setTimeout(function () {
							$(".country-select input").countrySelect("handleAutoCountry");
						});
					});
				}
			}
		},
		// Focus input and put the cursor at the end
		_focus: function () {
			this.countryInput.focus();
			var input = this.countryInput[0];
			// works for Chrome, FF, Safari, IE9+
			if (input.setSelectionRange) {
				var len = this.countryInput.val().length;
				input.setSelectionRange(len, len);
			}
		},
		// Show the dropdown
		_showDropdown: function () {
			this._setDropdownPosition();
			// update highlighting and scroll to active list item
			var activeListItem = this.countryList.children(".active");
			this._highlightListItem(activeListItem);
			// show it
			this.countryList.removeClass("hide");
			this._scrollTo(activeListItem);
			// bind all the dropdown-related listeners: mouseover, click, click-off, keydown
			this._bindDropdownListeners();
			// update the arrow
			this.selectedFlagInner.parent().children(".arrow").addClass("up");
		},
		// decide where to position dropdown (depends on position within viewport, and scroll)
		_setDropdownPosition: function () {
			var inputTop = this.countryInput.offset().top, windowTop = $(window).scrollTop(),
				dropdownFitsBelow = inputTop + this.countryInput.outerHeight() + this.dropdownHeight < windowTop + $(window).height(), dropdownFitsAbove = inputTop - this.dropdownHeight > windowTop;
			// dropdownHeight - 1 for border
			var cssTop = !dropdownFitsBelow && dropdownFitsAbove ? "-" + (this.dropdownHeight - 1) + "px" : "";
			this.countryList.css("top", cssTop);
		},
		// we only bind dropdown listeners when the dropdown is open
		_bindDropdownListeners: function () {
			var that = this;
			// when mouse over a list item, just highlight that one
			// we add the class "highlight", so if they hit "enter" we know which one to select
			this.countryList.on("mouseover" + this.ns, ".country", function (e) {
				that._highlightListItem($(this));
			});
			// listen for country selection
			this.countryList.on("click" + this.ns, ".country", function (e) {
				that._selectListItem($(this));
			});
			// click off to close
			// (except when this initial opening click is bubbling up)
			// we cannot just stopPropagation as it may be needed to close another instance
			var isOpening = true;
			$("html").on("click" + this.ns, function (e) {
				e.preventDefault();
				if (!isOpening) {
					that._closeDropdown();
				}
				isOpening = false;
			});
			// Listen for up/down scrolling, enter to select, or letters to jump to country name.
			// Use keydown as keypress doesn't fire for non-char keys and we want to catch if they
			// just hit down and hold it to scroll down (no keyup event).
			// Listen on the document because that's where key events are triggered if no input has focus
			$(document).on("keydown" + this.ns, function (e) {
				// prevent down key from scrolling the whole page,
				// and enter key from submitting a form etc
				e.preventDefault();
				if (e.which == keys.UP || e.which == keys.DOWN) {
					// up and down to navigate
					that._handleUpDownKey(e.which);
				} else if (e.which == keys.ENTER) {
					// enter to select
					that._handleEnterKey();
				} else if (e.which == keys.ESC) {
					// esc to close
					that._closeDropdown();
				} else if (e.which >= keys.A && e.which <= keys.Z || e.which === keys.SPACE) {
					that.typedLetters += String.fromCharCode(e.which);
					that._filterCountries(that.typedLetters);
				} else if (e.which === keys.BACKSPACE) {
					that.typedLetters = that.typedLetters.slice(0, -1);
					that._filterCountries(that.typedLetters);
				}
			});
		},
		// Highlight the next/prev item in the list (and ensure it is visible)
		_handleUpDownKey: function (key) {
			var current = this.countryList.children(".highlight").first();
			var next = key == keys.UP ? current.prev() : current.next();
			if (next.length) {
				// skip the divider
				if (next.hasClass("divider")) {
					next = key == keys.UP ? next.prev() : next.next();
				}
				this._highlightListItem(next);
				this._scrollTo(next);
			}
		},
		// select the currently highlighted item
		_handleEnterKey: function () {
			var currentCountry = this.countryList.children(".highlight").first();
			if (currentCountry.length) {
				this._selectListItem(currentCountry);
			}
		},
		_filterCountries: function (letters) {
			var countries = this.countryListItems.filter(function () {
				return $(this).text().toUpperCase().indexOf(letters) === 0 && !$(this).hasClass("preferred");
			});
			if (countries.length) {
				// if one is already highlighted, then we want the next one
				var highlightedCountry = countries.filter(".highlight").first(), listItem;
				if (highlightedCountry && highlightedCountry.next() && highlightedCountry.next().text().toUpperCase().indexOf(letters) === 0) {
					listItem = highlightedCountry.next();
				} else {
					listItem = countries.first();
				}
				// update highlighting and scroll
				this._highlightListItem(listItem);
				this._scrollTo(listItem);
			}
		},
		// Update the selected flag using the input's current value
		_updateFlagFromInputVal: function () {
			var that = this;
			// try and extract valid country from input
			var value = this.countryInput.val().replace(/(?=[() ])/g, '\\');
			if (value) {
				var countryCodes = [];
				var matcher = new RegExp("^" + value, "i");
				for (var i = 0; i < this.countries.length; i++) {
					if (this.countries[i].name.match(matcher)) {
						countryCodes.push(this.countries[i].iso2);
					}
				}
				// Check if one of the matching countries is already selected
				var alreadySelected = false;
				$.each(countryCodes, function (i, c) {
					if (that.selectedFlagInner.hasClass(c)) {
						alreadySelected = true;
					}
				});
				if (!alreadySelected) {
					this._selectFlag(countryCodes[0]);
					this.countryCodeInput.val(countryCodes[0]).trigger("change");
				}
				// Matching country found
				return true;
			}
			// No match found
			return false;
		},
		// remove highlighting from other list items and highlight the given item
		_highlightListItem: function (listItem) {
			this.countryListItems.removeClass("highlight");
			listItem.addClass("highlight");
		},
		// find the country data for the given country code
		// the ignoreOnlyCountriesOption is only used during init() while parsing the onlyCountries array
		_getCountryData: function (countryCode, ignoreOnlyCountriesOption) {
			var countryList = ignoreOnlyCountriesOption ? allCountries : this.countries;
			for (var i = 0; i < countryList.length; i++) {
				if (countryList[i].iso2 == countryCode) {
					return countryList[i];
				}
			}
			return null;
		},
		// update the selected flag and the active list item
		_selectFlag: function (countryCode) {
			if (!countryCode) {
				return false;
			}
			this.selectedFlagInner.attr("class", "flag " + countryCode);
			// update the title attribute
			var countryData = this._getCountryData(countryCode);
			this.selectedFlagInner.parent().attr("title", countryData.name);
			// update the active list item
			var listItem = this.countryListItems.children(".flag." + countryCode).first().parent();
			this.countryListItems.removeClass("active");
			listItem.addClass("active");
		},
		// called when the user selects a list item from the dropdown
		_selectListItem: function (listItem) {
			// update selected flag and active list item
			var countryCode = listItem.attr("data-country-code");
			this._selectFlag(countryCode);
			this._closeDropdown();
			// update input value
			this._updateName(countryCode);
			this.countryInput.trigger("change");
			this.countryCodeInput.trigger("change");
			// focus the input
			this._focus();
		},
		// close the dropdown and unbind any listeners
		_closeDropdown: function () {
			this.countryList.addClass("hide");
			// update the arrow
			this.selectedFlagInner.parent().children(".arrow").removeClass("up");
			// unbind event listeners
			$(document).off("keydown" + this.ns);
			$("html").off("click" + this.ns);
			// unbind both hover and click listeners
			this.countryList.off(this.ns);
			this.typedLetters = "";
		},
		// check if an element is visible within its container, else scroll until it is
		_scrollTo: function (element) {
			if (!element || !element.offset()) {
				return;
			}
			var container = this.countryList, containerHeight = container.height(), containerTop = container.offset().top, containerBottom = containerTop + containerHeight, elementHeight = element.outerHeight(), elementTop = element.offset().top, elementBottom = elementTop + elementHeight, newScrollTop = elementTop - containerTop + container.scrollTop();
			if (elementTop < containerTop) {
				// scroll up
				container.scrollTop(newScrollTop);
			} else if (elementBottom > containerBottom) {
				// scroll down
				var heightDifference = containerHeight - elementHeight;
				container.scrollTop(newScrollTop - heightDifference);
			}
		},
		// Replace any existing country name with the new one
		_updateName: function (countryCode) {
			this.countryCodeInput.val(countryCode).trigger("change");
			this.countryInput.val(this._getCountryData(countryCode).iso2);
		},
		/********************
		 *  PUBLIC METHODS
		 ********************/
		// this is called when the geoip call returns
		handleAutoCountry: function () {
			if (this.options.initialCountry === "auto") {
				// we must set this even if there is an initial val in the input: in case the initial val is invalid and they delete it - they should see their auto country
				this.defaultCountry = $.fn[pluginName].autoCountry;
				// if there's no initial value in the input, then update the flag
				if (!this.countryInput.val()) {
					this.selectCountry(this.defaultCountry);
				}
				this.autoCountryDeferred.resolve();
			}
		},
		// get the country data for the currently selected flag
		getSelectedCountryData: function () {
			// rely on the fact that we only set 2 classes on the selected flag element:
			// the first is "flag" and the second is the 2-char country code
			var countryCode = this.selectedFlagInner.attr("class").split(" ")[1];
			return this._getCountryData(countryCode);
		},
		// update the selected flag
		selectCountry: function (countryCode) {
			countryCode = countryCode.toLowerCase();
			// check if already selected
			if (!this.selectedFlagInner.hasClass(countryCode)) {
				this._selectFlag(countryCode);
				this._updateName(countryCode);
			}
		},
		// set the input value and update the flag
		setCountry: function (country) {
			this.countryInput.val(country);
			this._updateFlagFromInputVal();
		},
		// remove plugin
		destroy: function () {
			// stop listeners
			this.countryInput.off(this.ns);
			this.selectedFlagInner.parent().off(this.ns);
			// remove markup
			var container = this.countryInput.parent();
			container.before(this.countryInput).remove();
		}
	};
	// adapted to allow public functions
	// using https://github.com/jquery-boilerplate/jquery-boilerplate/wiki/Extending-jQuery-Boilerplate
	$.fn[pluginName] = function (options) {
		var args = arguments;
		// Is the first parameter an object (options), or was omitted,
		// instantiate a new instance of the plugin.
		if (options === undefined || typeof options === "object") {
			return this.each(function () {
				if (!$.data(this, "plugin_" + pluginName)) {
					$.data(this, "plugin_" + pluginName, new Plugin(this, options));
				}
			});
		} else if (typeof options === "string" && options[0] !== "_" && options !== "init") {
			// If the first parameter is a string and it doesn't start
			// with an underscore or "contains" the `init`-function,
			// treat this as a call to a public method.
			// Cache the method call to make it possible to return a value
			var returns;
			this.each(function () {
				var instance = $.data(this, "plugin_" + pluginName);
				// Tests that there's already a plugin-instance
				// and checks that the requested public method exists
				if (instance instanceof Plugin && typeof instance[options] === "function") {
					// Call the method of our plugin instance,
					// and pass it the supplied arguments.
					returns = instance[options].apply(instance, Array.prototype.slice.call(args, 1));
				}
				// Allow instances to be destroyed via the 'destroy' method
				if (options === "destroy") {
					$.data(this, "plugin_" + pluginName, null);
				}
			});
			// If the earlier cached method gives a value back return the value,
			// otherwise return this to preserve chainability.
			return returns !== undefined ? returns : this;
		}
	};
	/********************
   *  STATIC METHODS
   ********************/
	// get the country data object
	$.fn[pluginName].getCountryData = function () {
		return allCountries;
	};
	// set the country data object
	$.fn[pluginName].setCountryData = function (obj) {
		allCountries = obj;
	};
	// Tell JSHint to ignore this warning: "character may get silently deleted by one or more browsers"
	// jshint -W100
	// Array of country objects for the flag dropdown.
	// Each contains a name and country code (ISO 3166-1 alpha-2).
	//
	// Note: using single char property names to keep filesize down
	// n = name
	// i = iso2 (2-char country code)
	var allCountries = $.each([{
		n: "‫افغانستان‬‎",
		i: "af"
	}, {
		n: "جزر آلاند",
		i: "ax"
	}, {
		n: "ألبانيا",
		i: "al"
	}, {
		n: "‫الجزائر‬‎",
		i: "dz"
	}, {
		n: "ساموا الأمريكية",
		i: "as"
	}, {
		n: "أندورا",
		i: "ad"
	}, {
		n: "أنغولا",
		i: "ao"
	}, {
		n: "أنغيلا",
		i: "ai"
	}, {
		n: "أنتيغوا وبربودا",
		i: "ag"
	}, {
		n: "الأرجنتين",
		i: "ar"
	}, {
		n: "أرمينيا",
		i: "am"
	}, {
		n: "أروبا",
		i: "aw"
	}, {
		n: "أستراليا",
		i: "au"
	}, {
		n: "أوستريا",
		i: "at"
	}, {
		n: "أذربيجان",
		i: "az"
	}, {
		n: "جزر البهاما",
		i: "bs"
	}, {
		n: "‫البحرين‬‎",
		i: "bh"
	}, {
		n: "بانغلادش",
		i: "bd"
	}, {
		n: "بربادوس",
		i: "bb"
	}, {
		n: "روسيا البيضاء",
		i: "by"
	}, {
		n: "بلجيكا",
		i: "be"
	}, {
		n: "بليز",
		i: "bz"
	}, {
		n: "بنين",
		i: "bj"
	}, {
		n: "برمودا",
		i: "bm"
	}, {
		n: "بوتان",
		i: "bt"
	}, {
		n: "بوليفيا",
		i: "bo"
	}, {
		n: "البوسنة والهرسك",
		i: "ba"
	}, {
		n: "بوتسوانا",
		i: "bw"
	}, {
		n: "البرازيل",
		i: "br"
	}, {
		n: "إقليم المحيط البريطاني الهندي",
		i: "io"
	}, {
		n: "جزر فيرجن البريطانية",
		i: "vg"
	}, {
		n: "بروناي",
		i: "bn"
	}, {
		n: "بلغاريا",
		i: "bg"
	}, {
		n: "بوركينا فاسو",
		i: "bf"
	}, {
		n: "بوروندي",
		i: "bi"
	}, {
		n: "كولومبيا",
		i: "kh"
	}, {
		n: "كاميرون",
		i: "cm"
	}, {
		n: "كندا",
		i: "ca"
	}, {
		n: "الرأس الأخضر",
		i: "cv"
	}, {
		n: "الكاريبي",
		i: "bq"
	}, {
		n: "جزر كايمان",
		i: "ky"
	}, {
		n: "جمهورية افريقيا الوسطى",
		i: "cf"
	}, {
		n: "تشاد",
		i: "td"
	}, {
		n: "تشيلي",
		i: "cl"
	}, {
		n: "الصين",
		i: "cn"
	}, {
		n: "جزيرة الكريسماس",
		i: "cx"
	}, {
		n: "كوكوس",
		i: "cc"
	}, {
		n: "كولومبيا",
		i: "co"
	}, {
		n: "‫جزر القمر‬‎",
		i: "km"
	}, {
		n: "جمهورية الكونغو الديموقراطية",
		i: "cd"
	}, {
		n: "جمهورية الكونغو",
		i: "cg"
	}, {
		n: "جزر كوك",
		i: "ck"
	}, {
		n: "كوستا ريكا",
		i: "cr"
	}, {
		n: "ساحل العاج",
		i: "ci"
	}, {
		n: "كرواتيا",
		i: "hr"
	}, {
		n: "كوبا",
		i: "cu"
	}, {
		n: "كوراساو",
		i: "cw"
	}, {
		n: "قبرص",
		i: "cy"
	}, {
		n: "جمهورية التشيك",
		i: "cz"
	}, {
		n: "الدنمارك",
		i: "dk"
	}, {
		n: "جيبوتي",
		i: "dj"
	}, {
		n: "دومينيكا",
		i: "dm"
	}, {
		n: "جمهورية الدومنيكان",
		i: "do"
	}, {
		n: "إكوادور",
		i: "ec"
	}, {
		n: "‫مصر‬‎",
		i: "eg"
	}, {
		n: "السلفادور",
		i: "sv"
	}, {
		n: "غينيا الإستوائية",
		i: "gq"
	}, {
		n: "إريتريا",
		i: "er"
	}, {
		n: "إستونيا",
		i: "ee"
	}, {
		n: "أثيوبيا",
		i: "et"
	}, {
		n: "جزر فوكلاند",
		i: "fk"
	}, {
		n: "جزر فاروس",
		i: "fo"
	}, {
		n: "فيجي",
		i: "fj"
	}, {
		n: "فنلندا",
		i: "fi"
	}, {
		n: "فرنسا",
		i: "fr"
	}, {
		n: "غيانا الفرنسية",
		i: "gf"
	}, {
		n: "بولينيزيا الفرنسية",
		i: "pf"
	}, {
		n: "الغابون",
		i: "ga"
	}, {
		n: "غامبيا",
		i: "gm"
	}, {
		n: "جورجيا",
		i: "ge"
	}, {
		n: "ألمانيا",
		i: "de"
	}, {
		n: "غانا",
		i: "gh"
	}, {
		n: "جبل طارق",
		i: "gi"
	}, {
		n: "اليونان",
		i: "gr"
	}, {
		n: "الأرض الخضراء",
		i: "gl"
	}, {
		n: "غرينادا",
		i: "gd"
	}, {
		n: "غواديلوب",
		i: "gp"
	}, {
		n: "غوام",
		i: "gu"
	}, {
		n: "غواتيمالا",
		i: "gt"
	}, {
		n: "غيرنسي",
		i: "gg"
	}, {
		n: "غينيا",
		i: "gn"
	}, {
		n: "غينيا - بيساو",
		i: "gw"
	}, {
		n: "غيانا",
		i: "gy"
	}, {
		n: "هايتي",
		i: "ht"
	}, {
		n: "هندوراس",
		i: "hn"
	}, {
		n: "هونج كونج",
		i: "hk"
	}, {
		n: "هنغاريا",
		i: "hu"
	}, {
		n: "أيسلندا",
		i: "is"
	}, {
		n: "الهند",
		i: "in"
	}, {
		n: "أندنوسيا",
		i: "id"
	}, {
		n: "‫ایران‬‎",
		i: "ir"
	}, {
		n: "‫العراق‬‎",
		i: "iq"
	}, {
		n: "أيرلندا",
		i: "ie"
	}, {
		n: "جزيرة آيل أوف مان",
		i: "im"
	}, {
		n: "فلسطين المُحتلة",
		i: "il"
	}, {
		n: "إيطاليا",
		i: "it"
	}, {
		n: "جامايكا",
		i: "jm"
	}, {
		n: "اليابان",
		i: "jp"
	}, {
		n: "جيرسي",
		i: "je"
	}, {
		n: "‫الأردن‬‎",
		i: "jo"
	}, {
		n: "كازاخستان",
		i: "kz"
	}, {
		n: "كينيا",
		i: "ke"
	}, {
		n: "كيريباتي",
		i: "ki"
	}, {
		n: "كوسوفو",
		i: "xk"
	}, {
		n: "‫الكويت‬‎",
		i: "kw"
	}, {
		n: "قيرغيزستان",
		i: "kg"
	}, {
		n: "لاوس",
		i: "la"
	}, {
		n: "لاتفيا",
		i: "lv"
	}, {
		n: "‫لبنان‬‎",
		i: "lb"
	}, {
		n: "ليسوتو",
		i: "ls"
	}, {
		n: "ليبيريا",
		i: "lr"
	}, {
		n: "‫ليبيا‬‎",
		i: "ly"
	}, {
		n: "ليختنشتاين",
		i: "li"
	}, {
		n: "ليتوانيا",
		i: "lt"
	}, {
		n: "لوكسمبورج",
		i: "lu"
	}, {
		n: "ماكاو",
		i: "mo"
	}, {
		n: "مقدونيا",
		i: "mk"
	}, {
		n: "مدغشقر",
		i: "mg"
	}, {
		n: "ملاوي",
		i: "mw"
	}, {
		n: "ماليزيا",
		i: "my"
	}, {
		n: "جزر المالديف",
		i: "mv"
	}, {
		n: "مالي",
		i: "ml"
	}, {
		n: "مالطا",
		i: "mt"
	}, {
		n: "جزر مارشال",
		i: "mh"
	}, {
		n: "مارتينيك",
		i: "mq"
	}, {
		n: "‫موريتانيا‬‎",
		i: "mr"
	}, {
		n: "موريشيوس",
		i: "mu"
	}, {
		n: "مايوت",
		i: "yt"
	}, {
		n: "المكسيك",
		i: "mx"
	}, {
		n: "ميكرونيزيا",
		i: "fm"
	}, {
		n: "مولدوفا",
		i: "md"
	}, {
		n: "موناكو",
		i: "mc"
	}, {
		n: "منغوليا",
		i: "mn"
	}, {
		n: "الجبل الأسود",
		i: "me"
	}, {
		n: "مونتسيرات",
		i: "ms"
	}, {
		n: "‫المغرب‬‎",
		i: "ma"
	}, {
		n: "موزمبيق",
		i: "mz"
	}, {
		n: "ميانمار",
		i: "mm"
	}, {
		n: "ناميبيا",
		i: "na"
	}, {
		n: "ناورو",
		i: "nr"
	}, {
		n: "نيبال",
		i: "np"
	}, {
		n: "هولندا",
		i: "nl"
	}, {
		n: "كاليدونيا الجديدة",
		i: "nc"
	}, {
		n: "نيوزيلندا",
		i: "nz"
	}, {
		n: "نيكاراغوا",
		i: "ni"
	}, {
		n: "النيجر",
		i: "ne"
	}, {
		n: "نيجيريا",
		i: "ng"
	}, {
		n: "نيوي",
		i: "nu"
	}, {
		n: "جزيرة نورفولك",
		i: "nf"
	}, {
		n: "كوريا الشمالية",
		i: "kp"
	}, {
		n: "جزر مريانا الشمالية",
		i: "mp"
	}, {
		n: "النرويج",
		i: "no"
	}, {
		n: "‫عُمان‬‎",
		i: "om"
	}, {
		n: "‫پاکستان‬‎",
		i: "pk"
	}, {
		n: "بالاو",
		i: "pw"
	}, {
		n: "‫فلسطين‬‎",
		i: "ps"
	}, {
		n: "بنما",
		i: "pa"
	}, {
		n: "بابوا غينيا الجديدة",
		i: "pg"
	}, {
		n: "باراغواي",
		i: "py"
	}, {
		n: "بيرو",
		i: "pe"
	}, {
		n: "الفلبين",
		i: "ph"
	}, {
		n: "جزر بيتكيرن",
		i: "pn"
	}, {
		n: "بولندا",
		i: "pl"
	}, {
		n: "البرتغال",
		i: "pt"
	}, {
		n: "بورتوريكو",
		i: "pr"
	}, {
		n: "‫قطر‬‎",
		i: "qa"
	}, {
		n: "جمع شمل",
		i: "re"
	}, {
		n: "رومانيا",
		i: "ro"
	}, {
		n: "روسيا",
		i: "ru"
	}, {
		n: "رواندا",
		i: "rw"
	}, {
		n: "سانت بارتيليمي",
		i: "bl"
	}, {
		n: "سانت هيلانة",
		i: "sh"
	}, {
		n: "سانت كيتس ونيفيس",
		i: "kn"
	}, {
		n: "القديسة لوسيا",
		i: "lc"
	}, {
		n: "القديس مارتن",
		i: "mf"
	}, {
		n: "سانت بيير وميكلون",
		i: "pm"
	}, {
		n: "سانت فنسنت وجزر غرينادين",
		i: "vc"
	}, {
		n: "ساموا",
		i: "ws"
	}, {
		n: "سان مارينو",
		i: "sm"
	}, {
		n: "سان تومي وبرينسيبي",
		i: "st"
	}, {
		n: "‫المملكة العربية السعودية‬‎",
		i: "sa"
	}, {
		n: "السنغال",
		i: "sn"
	}, {
		n: "صربيا",
		i: "rs"
	}, {
		n: "سيشيل",
		i: "sc"
	}, {
		n: "سيرا ليون",
		i: "sl"
	}, {
		n: "سنغافورا",
		i: "sg"
	}, {
		n: "سينت مارتن",
		i: "sx"
	}, {
		n: "سلوفاكيا",
		i: "sk"
	}, {
		n: "سلوفينيا",
		i: "si"
	}, {
		n: "جزر سليمان",
		i: "sb"
	}, {
		n: "الصومال",
		i: "so"
	}, {
		n: "جنوب أفريقيا",
		i: "za"
	}, {
		n: "جورجيا الجنوبية",
		i: "gs"
	}, {
		n: "كوريا الجنوبية",
		i: "kr"
	}, {
		n: "‫جنوب السودان‬‎",
		i: "ss"
	}, {
		n: "إسبانيا",
		i: "es"
	}, {
		n: "سيريلانكا",
		i: "lk"
	}, {
		n: "‫السودان‬‎",
		i: "sd"
	}, {
		n: "سورينام",
		i: "sr"
	}, {
		n: "سفالبارد وجان ماين",
		i: "sj"
	}, {
		n: "سوازيلاند",
		i: "sz"
	}, {
		n: "السويد",
		i: "se"
	}, {
		n: "سويسرا",
		i: "ch"
	}, {
		n: "‫سوريا‬‎",
		i: "sy"
	}, {
		n: "تايوان",
		i: "tw"
	}, {
		n: "طاجخستان",
		i: "tj"
	}, {
		n: "تنزانيا",
		i: "tz"
	}, {
		n: "تايلاند",
		i: "th"
	}, {
		n: "تيمور ليشتي",
		i: "tl"
	}, {
		n: "توجو",
		i: "tg"
	}, {
		n: "توكيلاو",
		i: "tk"
	}, {
		n: "تونغا",
		i: "to"
	}, {
		n: "ترينداد وتوباغو",
		i: "tt"
	}, {
		n: "‫تونس‬‎",
		i: "tn"
	}, {
		n: "تركيا",
		i: "tr"
	}, {
		n: "تركمانستان",
		i: "tm"
	}, {
		n: "جزر تركس وكايكوس",
		i: "tc"
	}, {
		n: "توفالو",
		i: "tv"
	}, {
		n: "أوغندا",
		i: "ug"
	}, {
		n: "أوكرانيا",
		i: "ua"
	}, {
		n: "‫الإمارات العربية المتحدة‬‎",
		i: "ae"
	}, {
		n: "المملكة المتحدة",
		i: "gb"
	}, {
		n: "الولايات المتحدة",
		i: "us"
	}, {
		n: "جزر الولايات المتحدة الصغيرة النائية",
		i: "um"
	}, {
		n: "جزر فيرجن الأمريكية",
		i: "vi"
	}, {
		n: "أوروغواي",
		i: "uy"
	}, {
		n: "اوزبكستان",
		i: "uz"
	}, {
		n: "فانواتو",
		i: "vu"
	}, {
		n: "مدينة الفاتيكان",
		i: "va"
	}, {
		n: "فنزويلا",
		i: "ve"
	}, {
		n: "فيتنام",
		i: "vn"
	}, {
		n: "واليس وفوتونا",
		i: "wf"
	}, {
		n: "‫الصحراء الغربية‬‎",
		i: "eh"
	}, {
		n: "‫اليمن‬‎",
		i: "ye"
	}, {
		n: "زامبيا",
		i: "zm"
	}, {
		n: "زيمبابوي",
		i: "zw"
	}], function (i, c) {
		c.name = c.n;
		c.iso2 = c.i;
		delete c.n;
		delete c.i;
	});
});
