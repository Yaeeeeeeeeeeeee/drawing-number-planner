import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImagePreviewDialog } from '../../src/renderer/components/ImagePreviewDialog';
const images=[{id:1,src:'/one.png',name:'原图一'},{id:2,src:'/two.png',name:'原图二'}];
describe('shared image viewer',()=>{
 it('opens actual images, zooms, pans, fits and switches without mutating sources',()=>{
  render(<ImagePreviewDialog images={images} onClose={()=>{}}/>);
  const image=screen.getByRole('img',{name:'原图一'});
  expect(image).not.toHaveAttribute('title');
  fireEvent.click(screen.getByRole('button',{name:'放大'}));expect(image.style.transform).toContain('scale(1.25)');
  const surface=screen.getByLabelText('图片拖动区域');
  const pointer=(type:string,x:number,y:number)=>{const event=new Event(type,{bubbles:true});Object.defineProperties(event,{button:{value:0},clientX:{value:x},clientY:{value:y},pointerId:{value:1}});fireEvent(surface,event);};
  pointer('pointerdown',10,10);pointer('pointermove',45,30);pointer('pointerup',45,30);
  expect(image.style.transform).toContain('translate(35px, 20px)');
  fireEvent.click(screen.getByRole('button',{name:'适应窗口'}));expect(image.style.transform).toContain('scale(1)');
  fireEvent.click(screen.getByRole('button',{name:'下一张'}));expect(screen.getByRole('img',{name:'原图二'})).toHaveAttribute('src','/two.png');
  fireEvent.keyDown(window,{key:'ArrowLeft'});expect(screen.getByRole('img',{name:'原图一'})).toHaveAttribute('src','/one.png');
  expect(images[0].src).toBe('/one.png');
 });
 it('closes on Escape and reports unreadable images',()=>{
  const onClose=vi.fn();render(<ImagePreviewDialog images={images.slice(0,1)} onClose={onClose}/>);
  fireEvent.error(screen.getByRole('img'));expect(screen.getByRole('alert')).toHaveTextContent('图片无法读取');
  fireEvent.keyDown(window,{key:'Escape'});expect(onClose).toHaveBeenCalledOnce();
 });
});
