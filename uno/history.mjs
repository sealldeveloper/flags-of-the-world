// Local, bounded history of public notices observed by this tab. Never store hands.
export class RecentActions {
  constructor(limit = 50, now = Date.now) { this.limit = limit; this.now = now; this.reset(); }
  reset() { this.entries = []; this.lastKey = null; }
  record(view, presenting = false) {
    if (presenting || !['playing', 'finished'].includes(view?.phase) || !view.notice) return false;
    const key = JSON.stringify([view.round, view.effects?.revision ?? view.revision, view.notice]);
    if (key === this.lastKey) return false;
    this.lastKey = key;
    this.entries.unshift({round:view.round, text:view.notice, timestamp:this.now()});
    this.entries.length = Math.min(this.entries.length, this.limit);
    return true;
  }
}
