const pending=new WeakMap();
export function resetFeedback(button) {
  clearTimeout(pending.get(button));pending.delete(button);
  if(button.dataset.defaultLabel)button.textContent=button.dataset.defaultLabel;
  button.classList.remove('copy-success');
}
export function flashButton(button,text) {
  if(!button.dataset.defaultLabel)button.dataset.defaultLabel=button.textContent;
  clearTimeout(pending.get(button));button.textContent=text;button.classList.add('copy-success');
  pending.set(button,setTimeout(()=>resetFeedback(button),2200));
}
