var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

import { elem as __velem__ } from "vidom";
__velem__("input", null, _extends({
  "type": "text"
}, { value: "val", placeholder: "place" }));
