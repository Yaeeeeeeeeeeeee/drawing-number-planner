import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DictionariesPage } from '../../src/renderer/pages/DictionariesPage';

describe('dictionary real-page density', () => {
  it('keeps creation collapsed and filters loaded records without another API request', async () => {
    const listDictionaries=vi.fn(async () => [
      {id:1,code:'01',name:'品牌甲',status:'active'},
      {id:2,code:'02',name:'品牌乙',status:'inactive'},
    ]);
    render(<DictionariesPage api={{listDictionaries} as never}/>);
    await screen.findByText('品牌甲');
    expect(screen.queryByRole('textbox',{name:'编码'})).toBeNull();
    fireEvent.change(screen.getByLabelText('字典状态'),{target:{value:'inactive'}});
    expect(screen.queryByText('品牌甲')).toBeNull();
    expect(screen.getByText('品牌乙')).toBeVisible();
    fireEvent.change(screen.getByLabelText('搜索编码或名称'),{target:{value:'不存在'}});
    expect(screen.getByText('没有符合筛选条件的记录。')).toBeVisible();
    expect(listDictionaries).toHaveBeenCalledOnce();
  });
  it('preserves deleted identity distinctions without claiming a reference preflight', async () => {
    const item={id:1,code:'01',name:'品牌甲',status:'active'};
    const deleteDictionary=vi.fn();
    render(<DictionariesPage api={{listDictionaries:vi.fn(async()=>[item]),deleteDictionary} as never}/>);
    fireEvent.click(await screen.findByRole('button',{name:'删除 品牌甲'}));
    expect(screen.getByRole('alert')).toHaveTextContent('未引用的编码会物理删除');
    expect(screen.getByRole('alert')).toHaveTextContent('已引用的编码退出正常列表并保留历史身份');
    expect(screen.getByRole('alert')).toHaveTextContent('未提供独立引用预检');
    expect(deleteDictionary).not.toHaveBeenCalled();
  });
});
