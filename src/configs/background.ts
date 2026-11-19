export const TransparentFill = 'rgba(0,0,0,0)'
export const MinSize = 30
export const MaxSize = 800
export const Padding = 50000

export const DesignUnitMode = [
  {id: 0, name: 'mm'}, 
  {id: 1, name: 'px'}, 
]

export const DesignSizeMode = [
  {id: 0, name: 'Thẻ', disabled: false}, 
  {id: 1, name: 'Một trang', disabled: false}, 
  {id: 2, name: 'Tuỳ chỉnh', disabled: true}
]

export const BackgroundFillMode = [
  {id: 0, name: 'Tô đơn sắc'}, 
  {id: 1, name: 'Tô bằng ảnh'}, 
  {id: 2, name: 'Tô chuyển sắc'},
  {id: 3, name: 'Tô lưới'},
  {id: 4, name: 'Tô hình'},
  {id: 5, name: 'Tô thông minh'},
]

// 上传图片
export const BackgroundFillImageMode = [
  {id: 'contain', name: 'Thu phóng'}, 
  {id: 'repeat', name: 'Lát ghép'}, 
  {id: 'cover', name: 'Phủ kín'},
]

// 渐变色
export const BackgroundFillGradientMode = [
  {id: 0, name: 'Chuyển sắc tuyến tính', value: 'linear'}, 
  {id: 1, name: 'Chuyển sắc xuyên tâm', value: 'radial'}, 
]

// 网格图片
export const BackgroundFillGridMode = [
  {id: 0, name: 'Chuyển sắc', value: 'interpolateLinear'}, 
  {id: 1, name: 'Lấp lánh', value: 'sparkle'}, 
  {id: 2, name: 'Bóng', value: 'shadows'},
]