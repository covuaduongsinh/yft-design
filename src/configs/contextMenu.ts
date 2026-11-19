import { ContextMenu } from '@/components/Contextmenu/types'
import { ElementNames, AlignCommand, LayerCommand } from '@/types/elements'
import { storeToRefs } from 'pinia'
import { useMainStore } from '@/store'
import useHandleElement from '@/hooks/useHandleElement'
import useHandleTool from '@/hooks/useHandleTool'



export const contextMenuThumbnails = (): ContextMenu[] => {
  const { pasteElement } = useHandleElement()
  return [
    {
      text: 'Dán',
      subText: 'Ctrl + V',
      handler: pasteElement,
    },
    {
      text: 'Chọn tất cả',
      subText: 'Ctrl + A',
      // handler: selectAllSlide,
    },
    {
      text: 'Tạo trang mới',
      subText: 'Enter',
      // handler: createSlide,
    },
    {
      text: 'Xem trước trang',
      subText: 'F5',
      // handler: enterScreeningFromStart,
    },
  ]
}

export const contextMenus = (): ContextMenu[] => {
  const { lockElement, deleteElement, cutElement, copyElement, pasteElement, uncombineElements, combineElements, resetElements } = useHandleElement()
  const { alignElement, layerElement } = useHandleTool()
  const { canvasObject } = storeToRefs(useMainStore())
  const element = canvasObject.value
  if (!element) {
    return [
      {
        text: 'Dán',
        subText: 'Ctrl + V',
        // handler: pasteSlide,
        handler: pasteElement,
      },
      {
        text: 'Chọn tất cả',
        subText: 'Ctrl + A',
        // handler: selectAllSlide,
      },
      {
        text: 'Thước',
        // handler: createSlide,
      },
      {
        text: 'Lưới',
        // handler: enterScreeningFromStart,
      },
      {
        text: 'Đặt lại',
        handler: resetElements,
      },
    ]
  }
  if (element.lockMovementX && element.lockMovementY) {
    return [{
      text: 'Mở khoá', 
      handler: () => lockElement(element.id, false),
    }]
  }

  return [
    {
      text: 'Cắt',
      subText: 'Ctrl + X',
      handler: cutElement,
    },
    {
      text: 'Sao chép',
      subText: 'Ctrl + C',
      handler: copyElement,
    },
    {
      text: 'Dán',
      subText: 'Ctrl + V',
      handler: pasteElement,
    },
    { divider: true },
    {
      text: 'Căn giữa ngang',
      handler: () => alignElement(AlignCommand.HORIZONTAL),
      children: [
        { text: 'Căn giữa dọc', handler: () => alignElement(AlignCommand.CENTER), },
        { text: 'Căn giữa ngang', handler: () => alignElement(AlignCommand.HORIZONTAL) },
        { text: 'Căn trái', handler: () => alignElement(AlignCommand.LEFT) },
        { text: 'Căn phải', handler: () => alignElement(AlignCommand.RIGHT) },
      ],
    },
    {
      text: 'Căn giữa dọc',
      handler: () => alignElement(AlignCommand.VERTICAL),
      children: [
        { text: 'Căn giữa ngang', handler: () => alignElement(AlignCommand.CENTER) },
        { text: 'Căn giữa dọc', handler: () => alignElement(AlignCommand.VERTICAL) },
        { text: 'Căn trên', handler: () => alignElement(AlignCommand.TOP) },
        { text: 'Căn dưới', handler: () => alignElement(AlignCommand.BOTTOM) },
      ],
    },
    { divider: true },
    {
      text: 'Đưa lên trên cùng',
      // disable: props.isMultiSelect && !props.elementInfo.groupId,
      handler: () => layerElement(LayerCommand.TOP),
      children: [
        { text: 'Đưa lên trên cùng', handler: () => layerElement(LayerCommand.TOP) },
        { text: 'Lên một lớp', handler: () => layerElement(LayerCommand.UP) },
      ],
    },
    {
      text: 'Đưa xuống dưới cùng',
      // disable: props.isMultiSelect && !props.elementInfo.groupId,
      handler: () => layerElement(LayerCommand.BOTTOM),
      children: [
        { text: 'Đưa xuống dưới cùng', handler: () => layerElement(LayerCommand.BOTTOM) },
        { text: 'Xuống một lớp', handler: () => layerElement(LayerCommand.DOWN) },
      ],
    },
    { divider: true },
    {
      text: element.type === ElementNames.GROUP ? 'Bỏ nhóm' : 'Nhóm',
      subText: 'Ctrl + G',
      handler: element.type === ElementNames.GROUP ? uncombineElements : combineElements,
      // hide: !props.isMultiSelect,
    },
    {
      text: 'Chọn tất cả',
      subText: 'Ctrl + A',
      // handler: selectAllElement,
    },
    {
      text: 'Khoá',
      subText: 'Ctrl + L',
      handler: () => lockElement(element.id, true),
    },
    {
      text: 'Xoá',
      subText: 'Delete',
      handler: () => deleteElement(element.id),
    },
  ]
}

export const contextMenusThumbnails = (): ContextMenu[] => {
  return [
    {
      text: 'Cắt',
      subText: 'Ctrl + X',
      // handler: cutSlide,
    },
    {
      text: 'Sao chép',
      subText: 'Ctrl + C',
      // handler: copySlide,
    },
    {
      text: 'Dán',
      subText: 'Ctrl + V',
      // handler: pasteSlide,
    },
    {
      text: 'Chọn tất cả',
      subText: 'Ctrl + A',
      // handler: selectAllSlide,
    },
    { divider: true },
    {
      text: 'Tạo trang mới',
      subText: 'Enter',
      // handler: createSlide,
    },
    {
      text: 'Nhân bản trang',
      subText: 'Ctrl + D',
      // handler: copyAndPasteSlide,
    },
    {
      text: 'Xoá trang',
      subText: 'Delete',
      // handler: () => deleteSlide(),
    },
    { divider: true },
    {
      text: 'Xem trước từ đây',
      subText: 'Shift + F5',
      // handler: enterScreening,
    },
  ]
}