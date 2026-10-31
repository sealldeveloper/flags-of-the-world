import {groupRatings} from './ratings.mjs';
import {setImageSource} from './images.mjs';
const el=(tag,className='',text='')=>{const node=document.createElement(tag);node.className=className;node.textContent=text;return node;};
export class RatingPanel {
  constructor(container,onPreview){this.container=container;this.onPreview=onPreview;this.signature='';}
  render(images,players){
    const result=groupRatings(images,players),signature=JSON.stringify(result);if(signature===this.signature)return;this.signature=signature;
    const open=new Set([...this.container.querySelectorAll('details[open]')].map(node=>node.dataset.ties));
    const active=document.activeElement,focus=this.container.contains(active)?{group:active.closest('[data-rating-group]')?.dataset.ratingGroup,image:active.dataset.ratingImage}:null;
    this.container.replaceChildren();const known=new Map(images.map(image=>[image.id,image]));
    if(!result.tiers.highest.length){this.container.append(el('p','rating-empty','No ranked images yet.'));return;}
    for(const [mode,title] of [['tiers','Tiers only'],['ordered','Tiers + left-to-right']]){
      const section=el('section','rating-method'),results=el('div','rating-results');section.append(el('h3','',title));
      for(const [side,label] of [['highest','Highest rated'],['lowest','Lowest rated']]){
        const values=result[mode][side],group=el('section','rating-result'),list=el('div','rating-items');group.dataset.ratingGroup=mode+'-'+side;
        group.append(el('h4','',label+(values.length>1?` · ${values.length} tied`:'')),list);
        const item=value=>{
          const image=known.get(value.id),button=el('button','rating-item'),preview=new Image(),body=el('span','rating-item-body');button.type='button';button.dataset.ratingImage=image.id;button.title=image.label;
          setImageSource(preview,image);preview.alt='';preview.loading='lazy';preview.width=48;preview.height=48;
          body.append(el('span','rating-item-name',image.label),el('small','',`${value.votes} ranking${value.votes===1?'':'s'}`));button.append(preview,body);button.addEventListener('click',()=>this.onPreview(image));return button;
        };
        for(const value of values.slice(0,3))list.append(item(value));
        if(values.length>3){
          const details=el('details','rating-ties'),more=el('div','rating-items');details.dataset.ties=mode+'-'+side;details.append(el('summary','',`${values.length-3} more tied`),more);
          const populate=()=>{if(!more.children.length)for(const value of values.slice(3))more.append(item(value));};
          details.addEventListener('toggle',()=>{if(details.open)populate();});if(open.has(details.dataset.ties)){populate();details.open=true;}group.append(details);
        }
        results.append(group);
      }
      section.append(results);this.container.append(section);
    }
    if(focus?.image)this.container.querySelector(`[data-rating-group="${focus.group}"] [data-rating-image="${focus.image}"]`)?.focus({preventScroll:true});
  }
  reset(){this.signature='';this.container.replaceChildren();}
}
