/* Button 5 (final) for the hero Discord button; styles in experiments-live.css.
   The picker sets data-btn="5"; this only covers the case where it has not. */
(function () {
  var root = document.documentElement;
  if (!root.dataset.btn) root.dataset.btn = "5";
})();
